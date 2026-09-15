"""Flybrain GPU runtime on Modal.

Closed-loop walk: browser sends rays + goal heading, this process returns
{forward, turn}. Weights stay frozen (FlyWire / Shiu connectome when ingested).
Only a small motor readout is trained.

  modal deploy modal/app.py
  modal run modal/app.py::ingest
  modal run modal/app.py::train_policy
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import modal

APP = "flybrain"
VOL_PATH = "/data"
CONNECTOME_PT = f"{VOL_PATH}/connectome.pt"
READOUT_PT = f"{VOL_PATH}/readout.pt"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("numpy", "pandas", "pyarrow", "fastapi[standard]", "httpx")
    .pip_install(
        "torch",
        extra_options="--index-url https://download.pytorch.org/whl/cu124",
    )
)
volume = modal.Volume.from_name("flybrain-data", create_if_missing=True)
app = modal.App(APP, image=image)

RAY_COUNT = 16
SENSORY = RAY_COUNT + 6
RESERVOIR_N = 2048
FIRE_N = 96
ARENA_HALF = 11.0
CEILING = 7.2
FLY_RADIUS = 0.38
FLY_SPEED = 4.2
FLY_TURN = 2.4
FLY_PITCH = 1.8
RAY_FOV = 2.15
RAY_LENGTH = 6.5
GOAL_RADIUS = 0.95
OBSTACLES = [
    (3.2, -2.1, 2.4, 1.15),
    (-4.4, 3.1, 1.6, 2.6),
    (6.1, 5.2, 1.5, 1.5),
    (-6.2, -5.4, 3.1, 1.05),
    (0.2, 6.8, 4.4, 1.1),
    (-1.8, -7.2, 1.2, 3.2),
    (7.4, -6.6, 1.3, 2.2),
]


def _device():
    import torch

    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class NavigationNet:
    """Leaky reservoir + linear motor readout. Swap W for FlyWire when present."""

    def __init__(self, device, n=RESERVOIR_N):
        import torch

        self.device = device
        self.n = n
        g = torch.Generator(device="cpu").manual_seed(783)
        win = torch.randn(n, SENSORY, generator=g) * 0.35
        w = torch.randn(n, n, generator=g)
        w = w / (w.std() * math.sqrt(n) + 1e-6) * 0.9
        wout = torch.randn(3, n, generator=g) * 0.04
        self.win = win.to(device)
        self.w = w.to(device)
        self.wout = wout.to(device)
        self.b = torch.tensor([0.08, 0.0, 0.06], device=device)
        self.backend = "reservoir-gpu"
        self._load_readout()

    def _load_readout(self):
        import torch

        path = Path(READOUT_PT)
        if path.exists():
            payload = torch.load(path, map_location=self.device, weights_only=True)
            wout = payload["wout"].to(self.device)
            if wout.shape == self.wout.shape and float(wout.abs().mean()) > 1e-3:
                self.wout.copy_(wout)
                self.b.copy_(payload["b"].to(self.device))
                self.backend = str(payload.get("backend", self.backend)) + "+trained"

    def new_state(self):
        import torch

        return torch.zeros(self.n, device=self.device)

    def recurrent(self, h):
        import torch

        if getattr(self.w, "is_sparse", False):
            return torch.sparse.mm(self.w, h.unsqueeze(1)).squeeze(1)
        return self.w @ h

    def step(self, sensory, dt=0.05, h=None):
        import torch

        if h is None:
            h = self.new_state()
        x = torch.as_tensor(sensory, device=self.device, dtype=torch.float32)
        alpha = min(1.0, dt / 0.08)
        drive = self.win @ x + self.recurrent(h)
        h = (1 - alpha) * h + alpha * torch.tanh(drive)
        h = h + 0.018 * torch.randn_like(h)
        y = self.wout @ h + self.b
        n = int(h.numel())
        q = max(1, n // 4)
        left = h[:q].mean()
        right = h[q : 2 * q].mean()
        climb = h[2 * q : 3 * q].mean()
        dive = h[3 * q :].mean()
        explore = torch.tanh(3.4 * (h[0::8].mean() - h[1::8].mean()))
        lift = torch.tanh(2.8 * (h[2::8].mean() - h[3::8].mean()))
        rays = x[:10]
        avoid = rays[:5].mean() - rays[5:].mean()
        front = rays[3:7].mean()
        hit = x[RAY_COUNT + 4]
        alt = x[RAY_COUNT + 5]
        turn = torch.tanh(
            y[1]
            + 0.95 * x[RAY_COUNT]
            + 3.2 * (left - right)
            + 1.25 * avoid
            + 1.15 * explore
            + 0.9 * hit * torch.sign(left - right + 0.08)
        )
        pitch = torch.tanh(
            y[2]
            + 0.95 * x[RAY_COUNT + 2]
            + 0.45 * (climb - dive)
            + 0.25 * lift
            + 0.55 * torch.relu(0.45 - front)
        ) * 0.35 + 1.6 * (0.3 - alt)
        pitch = pitch.clamp(-1.0, 1.0)
        forward = torch.sigmoid(y[0] - 1.1 * (1.0 - front) - 0.65 * hit)
        idx = torch.linspace(0, n - 1, FIRE_N, device=h.device).long()
        fire = h[idx].abs().mul(0.95).clamp(0, 1).tolist()
        energy = float(h.abs().mean().item())
        return float(forward.item()), float(turn.item()), float(pitch.item()), energy, fire, h


def load_connectome_into(net: NavigationNet):
    """If ingest wrote a sparse FlyWire matrix, use it as the recurrent core."""
    import torch

    path = Path(CONNECTOME_PT)
    if not path.exists():
        return net
    payload = torch.load(path, map_location="cpu", weights_only=False)
    w = payload["w"]
    if not getattr(w, "is_sparse", False):
        return net
    n = int(w.shape[0])
    if n < 256:
        return net
    device = net.device
    w = w.coalesce().to(device)
    sensory_idx = payload.get("sensory_idx")
    motor_idx = payload.get("motor_idx")
    win = torch.zeros(n, SENSORY, device=device)
    if sensory_idx is None:
        sensory_idx = torch.arange(SENSORY)
    for i, neuron in enumerate(list(sensory_idx)[:SENSORY]):
        win[int(neuron), i] = 4.0
    wout = torch.zeros(3, n, device=device)
    if motor_idx is None:
        motor_idx = torch.arange(max(0, n - RESERVOIR_N), n)
    scale = 0.02
    wout[0, motor_idx.to(device)] = scale
    wout[1, motor_idx.to(device)[: len(motor_idx) // 2]] = scale
    wout[1, motor_idx.to(device)[len(motor_idx) // 2 :]] = -scale
    wout[2, motor_idx.to(device)] = scale * 0.4
    net.n = n
    net.w = w
    net.win = win
    net.wout = wout
    net.b = torch.tensor([0.2, 0.0, 0.0], device=device)
    net.backend = "flywire-gpu"
    net._load_readout()
    return net


@app.function(volumes={VOL_PATH: volume}, timeout=60 * 30, memory=8192)
def ingest():
    """Download Shiu/FlyWire v783 tables onto the Modal volume and cache a sparse W."""
    import httpx
    import pandas as pd
    import torch

    os.makedirs(VOL_PATH, exist_ok=True)
    files = {
        "Connectivity_783.parquet": "https://github.com/philshiu/Drosophila_brain_model/raw/main/Connectivity_783.parquet",
        "Completeness_783.csv": "https://github.com/philshiu/Drosophila_brain_model/raw/main/Completeness_783.csv",
    }
    for name, url in files.items():
        dest = Path(VOL_PATH) / name
        if dest.exists() and dest.stat().st_size > 1_000_000:
            continue
        print(f"downloading {name}")
        with httpx.stream("GET", url, follow_redirects=True, timeout=None) as response:
            response.raise_for_status()
            with dest.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)

    con = pd.read_parquet(Path(VOL_PATH) / "Connectivity_783.parquet")
    pre = torch.tensor(con["Presynaptic_Index"].to_numpy(), dtype=torch.int64)
    post = torch.tensor(con["Postsynaptic_Index"].to_numpy(), dtype=torch.int64)
    weight = torch.tensor(
        con["Excitatory x Connectivity"].to_numpy(), dtype=torch.float32
    )
    n = int(max(int(pre.max()), int(post.max())) + 1)
    w = torch.sparse_coo_tensor(
        torch.stack([post, pre]), weight, (n, n)
    ).coalesce()
    sensory_idx = torch.arange(0, min(SENSORY * 32, n), step=32)[:SENSORY]
    motor_idx = torch.arange(n - RESERVOIR_N, n)
    torch.save(
        {"w": w, "sensory_idx": sensory_idx, "motor_idx": motor_idx, "n": n},
        CONNECTOME_PT,
    )
    volume.commit()
    return {"neurons": n, "synapses": int(weight.numel())}


@app.cls(gpu="T4", volumes={VOL_PATH: volume}, timeout=60 * 60, scaledown_window=180)
@modal.concurrent(max_inputs=8)
class Brain:
    @modal.enter()
    def startup(self):
        device = _device()
        net = NavigationNet(device)
        try:
            volume.reload()
            self.net = load_connectome_into(net)
        except Exception as exc:  # noqa: BLE001
            print("connectome load skipped:", exc)
            self.net = net
        print("backend", self.net.backend, "device", device)
        self.sessions = {}

    def _session_net(self):
        return self.net

    @modal.asgi_app()
    def api(self):
        from fastapi import Body, FastAPI
        from fastapi.middleware.cors import CORSMiddleware

        web = FastAPI()
        web.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
        brain = self

        @web.get("/health")
        def health():
            net = brain._session_net()
            return {
                "ok": True,
                "backend": net.backend,
                "device": str(net.device),
                "n": net.n,
            }

        @web.post("/reset")
        def reset(body: dict = Body(default={})):
            sid = str(body.get("session") or "default")
            brain.sessions[sid] = brain.net.new_state()
            return {"ok": True, "backend": brain.net.backend}

        @web.post("/step")
        def step(body: dict = Body(...)):
            sid = str(body.get("session") or "default")
            h = brain.sessions.get(sid)
            if h is None:
                h = brain.net.new_state()
            rays = list((body.get("rays") or [])[:RAY_COUNT])
            while len(rays) < RAY_COUNT:
                rays.append(1.0)
            inten = max(0.0, min(1.5, float(body.get("intensity", 0.0))))
            hear = 0.35 + inten
            ga = float(body.get("goal_angle", 0.0))
            gp = float(body.get("goal_pitch", 0.0))
            sensory = rays + [
                math.sin(ga) * hear,
                math.cos(ga) * hear,
                math.sin(gp) * hear,
                min(1.0, float(body.get("goal_dist", 8.0)) / (ARENA_HALF * 2)),
                float(body.get("collision", 0.0)),
                min(1.0, float(body.get("altitude", 1.5)) / CEILING),
            ]
            while len(sensory) < SENSORY:
                sensory.append(0.0)
            forward, turn, pitch, energy, fire, h = brain.net.step(
                sensory[:SENSORY], dt=float(body.get("dt", 0.05)), h=h
            )
            brain.sessions[sid] = h
            return {
                "forward": forward,
                "turn": turn,
                "pitch": pitch,
                "energy": energy,
                "fire": fire,
                "backend": brain.net.backend,
            }

        return web


def _blocked(x, z, radius=FLY_RADIUS):
    if abs(x) > ARENA_HALF - radius or abs(z) > ARENA_HALF - radius:
        return True
    for ox, oz, w, d in OBSTACLES:
        nx = min(max(x, ox - w / 2), ox + w / 2)
        nz = min(max(z, oz - d / 2), oz + d / 2)
        if (x - nx) ** 2 + (z - nz) ** 2 < radius * radius:
            return True
    return False


def _rays(x, z, heading):
    out = []
    start = -RAY_FOV / 2
    step = RAY_FOV / (RAY_COUNT - 1)
    for i in range(RAY_COUNT):
        ang = heading + start + step * i
        hit = 1.0
        for k in range(1, 22):
            t = k / 21
            px = x + math.sin(ang) * RAY_LENGTH * t
            pz = z + math.cos(ang) * RAY_LENGTH * t
            if _blocked(px, pz, 0.08):
                hit = t
                break
        out.append(hit)
    return out


@app.function(gpu="T4", volumes={VOL_PATH: volume}, timeout=60 * 20)
def train_policy(episodes: int = 80):
    """Train only the motor readout with REINFORCE in a 2D copy of the arena."""
    import random
    import torch

    volume.reload()
    device = _device()
    net = NavigationNet(device)
    net.wout.requires_grad_(True)
    net.b.requires_grad_(True)
    opt = torch.optim.Adam([net.wout, net.b], lr=3e-3)

    def episode():
        x, z, heading = -6.5, -6.8, 0.7
        gx, gz = 7.4, 6.2
        h = net.new_state()
        logps = []
        rewards = []
        for _ in range(180):
            rays = _rays(x, z, heading)
            ang = math.atan2(gx - x, gz - z) - heading
            while ang > math.pi:
                ang -= 2 * math.pi
            while ang < -math.pi:
                ang += 2 * math.pi
            dist = math.hypot(gx - x, gz - z)
            collided = _blocked(x, z)
            sensory = rays + [
                math.sin(ang),
                math.cos(ang),
                0.0,
                min(1.0, dist / (ARENA_HALF * 2)),
                1.0 if collided else 0.0,
                0.25,
            ]
            x_t = torch.tensor(sensory, device=device, dtype=torch.float32)
            alpha = 0.6
            drive = net.win @ x_t + net.recurrent(h)
            h = (1 - alpha) * h + alpha * torch.tanh(drive)
            logits = net.wout @ h + net.b
            h = h.detach()
            fwd_dist = torch.distributions.Normal(torch.sigmoid(logits[0]), 0.08)
            turn_dist = torch.distributions.Normal(torch.tanh(logits[1]), 0.12)
            forward = torch.clamp(fwd_dist.sample(), 0, 1)
            turn = torch.clamp(turn_dist.sample(), -1, 1)
            logps.append(fwd_dist.log_prob(forward) + turn_dist.log_prob(turn))
            heading = heading + float(turn.item()) * FLY_TURN * 0.05
            step = float(forward.item()) * FLY_SPEED * 0.05
            nx = x + math.sin(heading) * step
            nz = z + math.cos(heading) * step
            if not _blocked(nx, nz):
                x, z = nx, nz
            dist2 = math.hypot(gx - x, gz - z)
            reward = (dist - dist2) * 4.0 - (0.4 if collided else 0.0)
            if dist2 < GOAL_RADIUS:
                reward += 8.0
                gx = (random.random() * 2 - 1) * (ARENA_HALF - 2)
                gz = (random.random() * 2 - 1) * (ARENA_HALF - 2)
            rewards.append(reward)
            dist = dist2
        return logps, rewards

    score = 0.0
    for ep in range(episodes):
        logps, rewards = episode()
        ret = 0.0
        returns = []
        for r in reversed(rewards):
            ret = r + 0.98 * ret
            returns.append(ret)
        returns.reverse()
        r_t = torch.tensor(returns, device=device)
        r_t = (r_t - r_t.mean()) / (r_t.std() + 1e-6)
        loss = -(torch.stack(logps) * r_t).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        score = float(sum(rewards))
        if ep % 10 == 0:
            print(ep, "reward", round(score, 2), "loss", float(loss.item()))

    torch.save(
        {
            "wout": net.wout.detach().cpu(),
            "b": net.b.detach().cpu(),
            "backend": net.backend,
        },
        READOUT_PT,
    )
    volume.commit()
    return {"last_reward": score, "backend": net.backend}
