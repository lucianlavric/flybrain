"use client";
"use no memo";

import { Canvas } from "@react-three/fiber";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CameraMode } from "@/components/ArenaCameras";
import { BrainFire } from "@/components/BrainFire";
import { FlyArena, type ArenaHud } from "@/components/FlyArena";
import {
  LocalFlyBrain,
  ModalFlyBrain,
  type BrainBackend,
  type BrainOutput,
  type BrainStep,
} from "@/lib/brain";
import { SONGS, STIMULI, type Stimulus } from "@/lib/hearing";
import type { Motor } from "@/lib/sim";
import { SoundLab } from "@/lib/sound-lab";

const idleHud: ArenaHud = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  forward: 0,
  turn: 0,
  climb: 0,
  energy: 0,
  collided: false,
  dist: 0,
  intensity: 0,
  valence: 0,
  hz: 0,
  joGain: 0,
  approach: 0,
};

const HOLD_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "q",
  "e",
  " ",
  "shift",
  "arrowup",
  "arrowleft",
  "arrowdown",
  "arrowright",
]);

export function ArenaApp() {
  const [mode, setMode] = useState<"brain" | "manual">("brain");
  const [camMode, setCamMode] = useState<CameraMode>("follow");
  const [showGizmos, setShowGizmos] = useState(true);
  const [backend, setBackend] = useState<BrainBackend>("modal");
  const [hud, setHud] = useState<ArenaHud>(idleHud);
  const [resetToken, setResetToken] = useState(0);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [link, setLink] = useState("off");
  const [stimulusId, setStimulusId] = useState("nectar");
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [dose, setDose] = useState(1);
  const [volume, setVolume] = useState(0.22);
  const [fileLabel, setFileLabel] = useState("");
  const motor = useRef<Motor>({ forward: 0.3, turn: 0, pitch: 0.12 });
  const energy = useRef(0.2);
  const [fire, setFire] = useState<number[]>(() => Array(96).fill(0));
  const [bars, setBars] = useState<number[]>(() => Array(16).fill(0));
  const local = useMemo(() => new LocalFlyBrain(), []);
  const remote = useMemo(() => new ModalFlyBrain(), []);
  const lab = useMemo(() => new SoundLab(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const stimulus = STIMULI.find((item) => item.id === stimulusId) ?? STIMULI[0];

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (HOLD_KEYS.has(key)) {
        event.preventDefault();
        setKeys((prev) => ({ ...prev, [key]: true }));
      }
      if (key === "m") setMode((prev) => (prev === "brain" ? "manual" : "brain"));
      if (key === "c")
        setCamMode((prev) => (prev === "follow" ? "free" : "follow"));
      if (key === "f") setCamMode("follow");
      if (key === "g") setShowGizmos((prev) => !prev);
      if (key === "r") setResetToken((n) => n + 1);
    };
    const up = (event: KeyboardEvent) => {
      setKeys((prev) => ({ ...prev, [event.key.toLowerCase()]: false }));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      lab.stop();
    };
  }, [lab]);

  useEffect(() => {
    if (backend === "modal") remote.connect();
    else remote.disconnect();
    const timer = window.setInterval(() => setLink(remote.status), 400);
    return () => {
      window.clearInterval(timer);
      remote.disconnect();
    };
  }, [backend, remote]);

  useEffect(() => {
    local.reset();
    remote.reset();
    motor.current = { forward: 0.3, turn: 0, pitch: 0.12 };
    setFire(Array(96).fill(0));
  }, [resetToken, local, remote]);

  useEffect(() => {
    lab.setListenGain(volume);
  }, [lab, volume]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setBars(lab.snapshot(stimulus).bars);
    }, 100);
    return () => window.clearInterval(timer);
  }, [lab, playing, stimulus]);

  const stopPlayback = useCallback(() => {
    lab.stop();
    setPlaying(false);
    setBars(Array(16).fill(0));
  }, [lab]);

  const playNow = useCallback(
    async (stim: Stimulus, resetFly = false) => {
      if (stim.kind === "file" && !lab.hasFile) {
        fileInput.current?.click();
        return;
      }
      if (resetFly) {
        local.reset();
        remote.reset();
        setResetToken((n) => n + 1);
      }
      await lab.play(stim);
      setPlaying(true);
      setHasPlayed(true);
    },
    [lab, local, remote],
  );

  const pickSong = (stim: Stimulus) => {
    setStimulusId(stim.id);
    void playNow(stim, false);
  };

  const onSense = useCallback(
    (payload: BrainStep) => {
      if (mode !== "brain") return;
      const apply = (out: BrainOutput) => {
        motor.current = {
          forward: out.forward,
          turn: out.turn,
          pitch: out.pitch,
        };
        energy.current = out.energy;
        if (out.fire?.length) setFire(out.fire);
      };
      if (backend === "modal") {
        if (remote.connected) void remote.step(payload).then(apply);
        return;
      }
      apply(local.step(payload));
    },
    [backend, local, mode, remote],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await lab.loadFile(file);
    setFileLabel(file.name);
    setStimulusId("file");
  };

  const status =
    backend === "local"
      ? "local flight controller"
      : link === "live"
        ? "Modal GPU live"
        : link === "connecting"
          ? "warming Modal GPU"
          : link === "error"
            ? remote.lastError || "Modal error"
            : "Modal idle";

  const valenceLabel =
    hud.intensity < 0.05
      ? "deaf / silent"
      : hud.valence > 0.14
        ? "attract"
        : hud.valence < -0.12
          ? "repel"
          : "ignore";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1a222c] text-zinc-100">
      <Canvas
        className="absolute inset-0 h-full w-full"
        shadows
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        camera={{ fov: 50, position: [0, 6, 10], near: 0.1, far: 80 }}
      >
        <FlyArena
          mode={mode}
          motor={motor}
          energy={energy}
          keys={keys}
          lab={lab}
          stimulus={stimulus}
          playing={playing}
          dose={dose}
          onSense={onSense}
          onHud={setHud}
          resetToken={resetToken}
          camMode={camMode}
          showGizmos={showGizmos}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">
              Audio → brain → motors
            </p>
            <h1 className="mt-1 text-xl font-medium tracking-tight">
              Flybody closed loop
            </h1>
            <p className="mt-1 max-w-md text-sm text-zinc-400">
              Same 3D flight mapping as the arena. The sugar goal is gone.
              Johnston&apos;s organ audio is the source. Brain motors move the
              anatomical fly.
            </p>
            <BrainFire
              backend={backend === "modal" ? "gpu" : "local"}
              bars={bars}
              fire={fire}
              forward={hud.forward}
              intensity={hud.intensity}
              live={mode === "brain" && (backend === "local" || link === "live")}
              pitch={hud.climb}
              turn={hud.turn}
            />
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <Link
              className="rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-sm text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/60"
              href="/taste"
            >
              Taste lab
            </Link>
            <Seg>
              <SegBtn on={mode === "brain"} onClick={() => setMode("brain")}>
                Brain
              </SegBtn>
              <SegBtn on={mode === "manual"} onClick={() => setMode("manual")}>
                Manual
              </SegBtn>
            </Seg>
            <Seg>
              <SegBtn
                on={backend === "modal"}
                onClick={() => setBackend("modal")}
              >
                Modal
              </SegBtn>
              <SegBtn
                on={backend === "local"}
                onClick={() => setBackend("local")}
              >
                Local
              </SegBtn>
            </Seg>
            <Seg>
              <SegBtn
                on={camMode === "follow"}
                onClick={() => setCamMode("follow")}
              >
                Follow fly
              </SegBtn>
              <SegBtn on={camMode === "free"} onClick={() => setCamMode("free")}>
                Free camera
              </SegBtn>
            </Seg>
            <Seg>
              <SegBtn
                on={showGizmos}
                onClick={() => setShowGizmos((prev) => !prev)}
              >
                Guides
              </SegBtn>
            </Seg>
            <button
              className="rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-sm text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/60"
              onClick={() => setResetToken((n) => n + 1)}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="pointer-events-auto max-w-xl rounded-2xl border border-white/10 bg-black/40 p-3.5 shadow-lg shadow-black/30 backdrop-blur-md">
            <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
              Library
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {SONGS.filter((item) => item.tag === "library").map((item) => (
                <button
                  className={`rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                    stimulusId === item.id
                      ? "bg-gradient-to-b from-amber-400 to-amber-500 text-black"
                      : "bg-white/5 text-zinc-200 hover:bg-white/10"
                  }`}
                  key={item.id}
                  onClick={() => pickSong(item)}
                  type="button"
                >
                  <span className="block font-medium leading-tight">
                    {item.name}
                  </span>
                  <span
                    className={`text-[10px] ${
                      stimulusId === item.id ? "text-black/70" : "text-zinc-500"
                    }`}
                  >
                    {item.id === "nectar"
                      ? "196–294 Hz"
                      : item.id === "swing"
                        ? "110–370 Hz"
                        : "scrap + noise"}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
              Artist tracks
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {SONGS.filter((item) => item.tag === "artist").map((item) => (
                <button
                  className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors ${
                    stimulusId === item.id
                      ? "bg-gradient-to-b from-amber-400 to-amber-500 text-black"
                      : "bg-white/5 text-zinc-200 hover:bg-white/10"
                  }`}
                  key={item.id}
                  onClick={() => pickSong(item)}
                  type="button"
                >
                  {item.cover ? (
                    <Image
                      alt=""
                      className="h-7 w-7 flex-none rounded-md object-cover"
                      height={28}
                      src={item.cover}
                      width={28}
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium leading-tight">
                      {item.name}
                    </span>
                    <span
                      className={`block text-[10px] ${
                        stimulusId === item.id
                          ? "text-black/70"
                          : "text-zinc-500"
                      }`}
                    >
                      {item.artist}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-zinc-300">{stimulus.note}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-amber-500/90 px-3 py-1.5 text-sm text-black"
                onClick={() => void playNow(stimulus, !playing)}
                type="button"
              >
                {playing ? "Replay" : "Play into brain"}
              </button>
              <button
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
                onClick={stopPlayback}
                type="button"
              >
                Stop
              </button>
              <button
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                Upload
              </button>
            </div>
            <input
              accept="audio/*"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
              ref={fileInput}
              type="file"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              Dose
              <input
                className="flex-1"
                max={1.6}
                min={0.35}
                onChange={(event) => setDose(Number(event.target.value))}
                step={0.05}
                type="range"
                value={dose}
              />
              <span>You</span>
              <input
                className="flex-1"
                max={0.7}
                min={0}
                onChange={(event) => setVolume(Number(event.target.value))}
                step={0.01}
                type="range"
                value={volume}
              />
            </label>
          </div>
          {hasPlayed ? (
            <div className="pointer-events-auto flex items-center gap-3.5 self-end rounded-full border border-white/10 bg-black/40 py-2.5 pr-6 pl-2.5 shadow-lg shadow-black/30 backdrop-blur-md">
              <div
                className="relative h-[72px] w-[72px] flex-none overflow-hidden rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.5)]"
                style={{
                  animation: "disc-spin 3.2s linear infinite",
                  animationPlayState: playing ? "running" : "paused",
                }}
              >
                {stimulus.cover ? (
                  <Image
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    height={72}
                    src={stimulus.cover}
                    width={72}
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, ${stimulus.color}, #1c1917)`,
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      "repeating-radial-gradient(circle, transparent 0 2px, rgba(0,0,0,0.13) 2px 3px)",
                  }}
                />
                <div className="absolute inset-[41%] rounded-full bg-[#0c0f14] shadow-[0_0_0_2px_rgba(255,255,255,0.3)]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] leading-tight font-semibold text-zinc-50">
                  {stimulus.name}
                </p>
                <p className="truncate text-[11px] text-zinc-400">
                  {stimulus.artist ?? "flybrain library"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-amber-400 uppercase">
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-amber-400 ${
                      playing ? "animate-pulse" : "opacity-30"
                    }`}
                  />
                  {playing ? "Playing into brain" : "Paused"}
                </p>
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-[11px] leading-5 text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md">
            <div>
              {valenceLabel} · JO {hud.joGain.toFixed(2)} · {Math.round(hud.hz)} Hz
            </div>
            <div>
              hear {hud.intensity.toFixed(2)}  val {hud.valence.toFixed(2)}  dist{" "}
              {hud.dist.toFixed(2)}
            </div>
            <MotorBar label="fwd" value={hud.forward} />
            <MotorBar label="turn" value={hud.turn} />
            <MotorBar label="climb" value={hud.climb} />
            <div>
              approach {hud.approach.toFixed(2)}  energy {hud.energy.toFixed(2)}
            </div>
            <div className={hud.collided ? "text-amber-400" : ""}>
              {status}
              {hud.collided ? " · hit" : ""}
            </div>
            <p className="mt-1 font-sans text-[10px] text-zinc-500">
              {camMode === "free"
                ? "drag look · right-drag pan · WASD walk · Q/E up down · F follow"
                : "WASD fly · Space/Shift · C free cam · F follow · G guides · M brain · R reset"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Seg({ children }: { children: ReactNode }) {
  return (
    <div className="flex rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md">
      {children}
    </div>
  );
}

function SegBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
        on
          ? "bg-gradient-to-b from-amber-400 to-amber-500 font-medium text-black shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function MotorBar({ label, value }: { label: string; value: number }) {
  const width = Math.min(100, Math.abs(value) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8">{label}</span>
      <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        <span
          className="absolute top-0 h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
          style={{
            left: value < 0 ? `${50 - width / 2}%` : "50%",
            width: `${width / 2}%`,
          }}
        />
      </span>
      <span>{value.toFixed(2)}</span>
    </div>
  );
}
