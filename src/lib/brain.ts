import { clamp, RAY_COUNT, type Motor } from "./sim";

export type BrainBackend = "local" | "modal";

export type HeardAudio = {
  intensity: number;
  valence: number;
  bearing: number;
  elevation: number;
  dist: number;
  approach: number;
};

export type BrainStep = {
  rays: number[];
  goalAngle: number;
  goalPitch: number;
  goalDist: number;
  altitude: number;
  collided: boolean;
  dt: number;
  audio?: HeardAudio;
};

export type BrainOutput = Motor & {
  energy: number;
  backend: BrainBackend | "warmup";
  fire?: number[];
};

export class LocalFlyBrain {
  private yawBump = 0;
  private pitchBump = 0;
  private turnMemory = 0;
  private pitchMemory = 0;
  private energy = 0.2;
  private wander = 0;

  reset() {
    this.yawBump = 0;
    this.pitchBump = 0;
    this.turnMemory = 0;
    this.pitchMemory = 0;
    this.energy = 0.2;
    this.wander = 0;
  }

  step(input: BrainStep): BrainOutput {
    const horiz = input.rays.slice(0, 10);
    const up = mean(input.rays.slice(10, 13));
    const down = mean(input.rays.slice(13, 16));
    const left = mean(horiz.slice(0, 5));
    const right = mean(horiz.slice(5));
    const front = mean(horiz.slice(3, 7));
    const near = 1 - front;
    const audio = input.audio;
    if (audio) {
      this.wander += input.dt * 0.95;
      const heard = audio.intensity > 0.05 && Math.abs(audio.valence) > 0.12;
      if (heard) {
        this.yawBump = this.yawBump * 0.72 + audio.bearing * audio.valence * 0.42;
        this.pitchBump =
          this.pitchBump * 0.7 + audio.elevation * audio.valence * 0.38;
    } else {
      this.yawBump = this.yawBump * 0.84 + Math.sin(this.wander * 0.65) * 0.12;
      this.pitchBump =
        this.pitchBump * 0.86 + (2.05 - input.altitude) * 0.12;
    }
    } else {
      this.yawBump = this.yawBump * 0.8 + input.goalAngle * 0.2;
      this.pitchBump = this.pitchBump * 0.78 + input.goalPitch * 0.22;
    }
    const avoidYaw = (left - right) * (0.5 + near * 1.4);
    const liftOver = near > 0.45 ? 0.55 : 0;
    const avoidPitch = (down - up) * 0.7 + liftOver;
    const panic = input.collided ? Math.sign(this.turnMemory || 1) * 0.8 : 0;
    this.turnMemory =
      this.turnMemory * 0.68 + (this.yawBump * 0.85 + avoidYaw + panic) * 0.32;
    this.pitchMemory =
      this.pitchMemory * 0.65 + (this.pitchBump * 0.95 + avoidPitch) * 0.35;
    let forward = clamp(0.28 + 0.6 * front * front, 0.18, 1);
    if (audio) {
      if (audio.intensity > 0.05 && audio.valence > 0.14) {
        const hover = audio.dist < 1.55;
        forward = hover
          ? 0.14
          : clamp(0.34 + (1 - Math.min(audio.dist / 10, 1)) * 0.28, 0.22, 0.82);
        if (hover) this.turnMemory += 0.22;
      } else if (audio.intensity > 0.05 && audio.valence < -0.12) {
        forward = clamp(0.52 + audio.intensity * 0.35, 0.4, 1);
      } else {
        forward = 0.26;
      }
    }
    if (input.collided && front < 0.4) forward = -0.22;
    this.energy =
      this.energy * 0.9 +
      (0.4 + near * 0.4 + (audio ? audio.intensity * 0.35 : 0)) * 0.1;
    const fire = Array.from({ length: 96 }, (_, i) => {
      const ray = input.rays[i % RAY_COUNT] ?? 1;
      const pulse = Math.abs(Math.sin(this.wander * 2.1 + i * 0.37));
      const hear = audio ? Math.max(0, audio.intensity) : 0;
      return clamp(pulse * (0.22 + hear * 0.55) + (1 - ray) * 0.45, 0, 1);
    });
    return {
      forward,
      turn: clamp(this.turnMemory, -1, 1),
      pitch: clamp(this.pitchMemory, -1, 1),
      energy: this.energy,
      backend: "local",
      fire,
    };
  }
}

function mean(values: number[]) {
  if (values.length === 0) return 1;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class ModalFlyBrain {
  private session = "fly";
  private last: BrainOutput = {
    forward: 0.25,
    turn: 0,
    pitch: 0,
    energy: 0,
    backend: "warmup",
    fire: Array(96).fill(0),
  };
  private queued: BrainStep | null = null;
  private inflight: Promise<BrainOutput> | null = null;
  status: "off" | "connecting" | "live" | "error" = "off";
  lastError = "";

  get connected() {
    return this.status === "live";
  }

  private rootUrl() {
    return (process.env.NEXT_PUBLIC_MODAL_BRAIN_URL ?? "").trim().replace(/\/$/, "");
  }

  connect() {
    const root = this.rootUrl();
    if (!root) {
      this.status = "off";
      this.lastError = "Set NEXT_PUBLIC_MODAL_BRAIN_URL";
      return;
    }
    this.status = "connecting";
    this.session = `fly-${Math.random().toString(36).slice(2, 10)}`;
    void fetch(`${root}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        await fetch(`${root}/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: this.session }),
        });
        this.status = "live";
        this.lastError = "";
      })
      .catch((err: unknown) => {
        this.status = "error";
        this.lastError = err instanceof Error ? err.message : "Modal error";
      });
  }

  disconnect() {
    this.status = "off";
  }

  reset() {
    const root = this.rootUrl();
    if (!root || this.status !== "live") return;
    void fetch(`${root}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: this.session }),
    });
  }

  async step(input: BrainStep): Promise<BrainOutput> {
    this.queued = input;
    if (this.inflight) return this.last;
    this.inflight = this.drain().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async drain(): Promise<BrainOutput> {
    const cur = this.queued;
    this.queued = null;
    if (!cur) return this.last;
    const out = await this.post(cur);
    this.last = out;
    return out;
  }

  private async post(input: BrainStep): Promise<BrainOutput> {
    const root = this.rootUrl();
    if (!root || this.status !== "live") {
      return { ...this.last, backend: "warmup" };
    }
    try {
      const res = await fetch(`${root}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: this.session,
          dt: input.dt,
          rays: input.rays.slice(0, RAY_COUNT),
          goal_angle: input.goalAngle,
          goal_pitch: input.goalPitch,
          goal_dist: input.goalDist,
          altitude: input.altitude,
          collision: input.collided ? 1 : 0,
          intensity: input.audio?.intensity ?? 0,
          valence: input.audio?.valence ?? 0,
        }),
      });
      if (!res.ok) throw new Error(`step ${res.status}`);
      const msg = (await res.json()) as {
        forward?: number;
        turn?: number;
        pitch?: number;
        energy?: number;
        fire?: number[];
      };
      return {
        forward: clamp(msg.forward ?? 0.2, -0.35, 1),
        turn: clamp(msg.turn ?? 0, -1, 1),
        pitch: clamp(msg.pitch ?? 0, -1, 1),
        energy: msg.energy ?? 0,
        backend: "modal",
        fire: Array.isArray(msg.fire) ? msg.fire : this.last.fire,
      };
    } catch (err) {
      this.status = "error";
      this.lastError = err instanceof Error ? err.message : "Modal step failed";
      return { ...this.last, backend: "warmup" };
    }
  }
}
