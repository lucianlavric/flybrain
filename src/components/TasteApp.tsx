"use client";
"use no memo";

import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CameraMode } from "@/components/ArenaCameras";
import { TasteArena, type TasteHud } from "@/components/TasteArena";
import { LocalFlyBrain, type BrainOutput, type BrainStep } from "@/lib/brain";
import {
  NEAR_FIELD,
  SONGS,
  STIMULI,
  TRIAL_SEC,
  verdictFrom,
  type Stimulus,
} from "@/lib/hearing";
import type { Motor } from "@/lib/sim";
import { SoundLab } from "@/lib/sound-lab";

const idleHud: TasteHud = {
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
  bars: Array(16).fill(0),
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

type Trial = {
  id: string;
  name: string;
  hz: number;
  duration: number;
  meanDist: number;
  nearFrac: number;
  approachIndex: number;
  meanValence: number;
  verdict: "attract" | "repel" | "ignore";
};

type SampleAcc = {
  n: number;
  dist: number;
  near: number;
  approach: number;
  valence: number;
};

export function TasteApp() {
  const [mode, setMode] = useState<"brain" | "manual">("brain");
  const [camMode, setCamMode] = useState<CameraMode>("follow");
  const [showGizmos, setShowGizmos] = useState(true);
  const [hud, setHud] = useState<TasteHud>(idleHud);
  const [resetToken, setResetToken] = useState(0);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [stimulusId, setStimulusId] = useState("nectar");
  const [playing, setPlaying] = useState(false);
  const [dose, setDose] = useState(1);
  const [volume, setVolume] = useState(0.22);
  const [trialLeft, setTrialLeft] = useState<number | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [fileLabel, setFileLabel] = useState("");
  const motor = useRef<Motor>({ forward: 0.28, turn: 0, pitch: 0.08 });
  const energy = useRef(0.2);
  const local = useMemo(() => new LocalFlyBrain(), []);
  const lab = useMemo(() => new SoundLab(), []);
  const acc = useRef<SampleAcc | null>(null);
  const trialTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
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
    local.reset();
    motor.current = { forward: 0.28, turn: 0, pitch: 0.08 };
  }, [resetToken, local]);

  useEffect(() => {
    lab.setListenGain(volume);
  }, [lab, volume]);

  const stopPlayback = useCallback(() => {
    lab.stop();
    setPlaying(false);
    if (trialTimer.current) window.clearTimeout(trialTimer.current);
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    trialTimer.current = null;
    tickTimer.current = null;
    setTrialLeft(null);
  }, [lab]);

  const finishTrial = useCallback(
    (stim: Stimulus) => {
      const bag = acc.current;
      lab.stop();
      setPlaying(false);
      setTrialLeft(null);
      if (!bag || bag.n < 4) return;
      const meanDist = bag.dist / bag.n;
      const nearFrac = bag.near / bag.n;
      const approachIndex = bag.approach / bag.n;
      const meanValence = bag.valence / bag.n;
      setTrials((prev) => [
        {
          id: `${stim.id}-${Date.now()}`,
          name: stim.id === "file" && fileLabel ? fileLabel : stim.name,
          hz: Math.round(hud.hz || stim.hz),
          duration: TRIAL_SEC,
          meanDist,
          nearFrac,
          approachIndex,
          meanValence,
          verdict: verdictFrom(approachIndex, nearFrac, meanValence),
        },
        ...prev,
      ]);
      acc.current = null;
    },
    [fileLabel, hud.hz, lab],
  );

  const playNow = useCallback(
    async (timed: boolean) => {
      if (stimulus.kind === "file" && !lab.hasFile) {
        fileInput.current?.click();
        return;
      }
      stopPlayback();
      local.reset();
      setResetToken((n) => n + 1);
      acc.current = timed
        ? { n: 0, dist: 0, near: 0, approach: 0, valence: 0 }
        : null;
      await lab.play(stimulus);
      setPlaying(true);
      if (!timed) return;
      setTrialLeft(TRIAL_SEC);
      tickTimer.current = window.setInterval(() => {
        setTrialLeft((left) => (left === null ? null : Math.max(0, left - 1)));
      }, 1000);
      trialTimer.current = window.setTimeout(() => {
        if (tickTimer.current) window.clearInterval(tickTimer.current);
        finishTrial(stimulus);
      }, TRIAL_SEC * 1000);
    },
    [finishTrial, lab, local, stimulus, stopPlayback],
  );

  const onSense = useCallback(
    (payload: BrainStep) => {
      if (acc.current && payload.audio) {
        acc.current.n += 1;
        acc.current.dist += payload.audio.dist;
        acc.current.near += payload.audio.dist < NEAR_FIELD ? 1 : 0;
        acc.current.approach += payload.audio.approach;
        acc.current.valence += payload.audio.valence;
      }
      if (mode !== "brain") return;
      const apply = (out: BrainOutput) => {
        motor.current = {
          forward: out.forward,
          turn: out.turn,
          pitch: out.pitch,
        };
        energy.current = out.energy;
      };
      apply(local.step(payload));
    },
    [local, mode],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await lab.loadFile(file);
    setFileLabel(file.name);
    setStimulusId("file");
  };

  const exportCsv = () => {
    const header = "name,hz,approach,near,mean_dist,valence,verdict";
    const rows = trials.map(
      (row) =>
        `${csv(row.name)},${row.hz},${row.approachIndex.toFixed(3)},${row.nearFrac.toFixed(3)},${row.meanDist.toFixed(2)},${row.meanValence.toFixed(3)},${row.verdict}`,
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fly-sound-taste.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const valenceLabel =
    hud.intensity < 0.05
      ? "deaf / silent"
      : hud.valence > 0.14
        ? "attract"
        : hud.valence < -0.12
          ? "repel"
          : "ignore";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b0d12] text-zinc-100">
      <Canvas
        className="absolute inset-0 h-full w-full"
        shadows
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        camera={{ fov: 50, position: [0, 6, 10], near: 0.1, far: 80 }}
      >
        <TasteArena
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
              Johnston&apos;s organ lab
            </p>
            <h1 className="mt-1 text-xl font-medium tracking-tight">
              Fly sound taste
            </h1>
            <p className="mt-1 max-w-md text-sm text-zinc-400">
              Empty chamber, one speaker. The fly hears 80–1000 Hz through a
              Johnston&apos;s organ model. Approach is like. Flight away is a
              candidate repellent. Ultrasonic gadgets should do nothing.
            </p>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <Link
              className="rounded-full bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
              href="/"
            >
              Arena
            </Link>
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                mode === "brain"
                  ? "bg-amber-500/90 text-black"
                  : "bg-zinc-800 text-zinc-200"
              }`}
              onClick={() => setMode("brain")}
              type="button"
            >
              Brain
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                mode === "manual"
                  ? "bg-amber-500/90 text-black"
                  : "bg-zinc-800 text-zinc-200"
              }`}
              onClick={() => setMode("manual")}
              type="button"
            >
              Manual
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                camMode === "follow"
                  ? "bg-amber-500/90 text-black"
                  : "bg-zinc-800 text-zinc-200"
              }`}
              onClick={() => setCamMode("follow")}
              type="button"
            >
              Follow fly
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                camMode === "free"
                  ? "bg-amber-500/90 text-black"
                  : "bg-zinc-800 text-zinc-200"
              }`}
              onClick={() => setCamMode("free")}
              type="button"
            >
              Free camera
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                showGizmos
                  ? "bg-amber-500/90 text-black"
                  : "bg-zinc-800 text-zinc-200"
              }`}
              onClick={() => setShowGizmos((prev) => !prev)}
              type="button"
            >
              Guides
            </button>
            <button
              className="rounded-full bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
              onClick={() => setResetToken((n) => n + 1)}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="pointer-events-auto max-h-[58vh] w-64 overflow-y-auto rounded-xl bg-black/50 p-3 backdrop-blur-sm">
            <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
              Library
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {SONGS.map((item) => (
                <button
                  className={`rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    stimulusId === item.id
                      ? "bg-amber-500/90 text-black"
                      : "bg-zinc-800/80 text-zinc-200"
                  }`}
                  key={item.id}
                  onClick={() => {
                    setStimulusId(item.id);
                    void lab.play(item).then(() => setPlaying(true));
                  }}
                  type="button"
                >
                  <span className="block leading-tight">{item.name}</span>
                  <span
                    className={`text-[10px] ${
                      stimulusId === item.id ? "text-black/70" : "text-zinc-500"
                    }`}
                  >
                    {item.tag}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
              Probes
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {STIMULI.filter((item) => item.kind !== "song").map((item) => (
                <button
                  className={`rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    stimulusId === item.id
                      ? "bg-amber-500/90 text-black"
                      : "bg-zinc-800/80 text-zinc-200"
                  }`}
                  key={item.id}
                  onClick={() => setStimulusId(item.id)}
                  type="button"
                >
                  <span className="block leading-tight">{item.name}</span>
                  <span
                    className={`text-[10px] ${
                      stimulusId === item.id ? "text-black/70" : "text-zinc-500"
                    }`}
                  >
                    {item.tag}
                    {item.id === "file" && fileLabel ? ` · ${fileLabel}` : ""}
                  </span>
                </button>
              ))}
            </div>
            <input
              accept="audio/*"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
              ref={fileInput}
              type="file"
            />
            <button
              className="mt-2 w-full rounded-lg bg-zinc-800 px-2.5 py-1.5 text-left text-sm text-zinc-200"
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              Upload audio
            </button>
          </div>
          <div className="pointer-events-auto max-w-sm rounded-xl bg-black/50 p-3 backdrop-blur-sm">
            <p className="text-sm text-zinc-300">{stimulus.note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-amber-500/90 px-3 py-1.5 text-sm text-black"
                onClick={() => void playNow(false)}
                type="button"
              >
                {playing && trialLeft === null ? "Replay" : "Play"}
              </button>
              <button
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-black"
                onClick={() => void playNow(true)}
                type="button"
              >
                {trialLeft === null ? `Trial ${TRIAL_SEC}s` : `${trialLeft}s left`}
              </button>
              <button
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
                onClick={stopPlayback}
                type="button"
              >
                Stop
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
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
              <span className="w-8 text-right">{dose.toFixed(2)}</span>
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              You
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
          <div className="pointer-events-auto w-72 rounded-xl bg-black/50 p-3 font-mono text-[11px] leading-5 text-zinc-300 backdrop-blur-sm">
            <div className="flex h-8 items-end gap-0.5">
              {hud.bars.map((bar, i) => (
                <span
                  className="flex-1 rounded-sm bg-amber-400/80"
                  key={i}
                  style={{ height: `${Math.max(8, bar * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-2">
              {valenceLabel} · JO {hud.joGain.toFixed(2)} · {Math.round(hud.hz)} Hz
            </div>
            <div>
              hear {hud.intensity.toFixed(2)}  val {hud.valence.toFixed(2)}  dist{" "}
              {hud.dist.toFixed(2)}
            </div>
            <div>
              approach {hud.approach.toFixed(2)}  near {NEAR_FIELD.toFixed(1)} m
            </div>
            <div className={hud.collided ? "text-amber-400" : ""}>
              yaw {hud.heading.toFixed(2)}  pitch {hud.pitch.toFixed(2)}
              {hud.collided ? " · wall" : ""}
            </div>
            <div className="mt-2 flex items-center justify-between text-zinc-400">
              <span>Trials</span>
              {trials.length > 0 ? (
                <button
                  className="text-amber-300"
                  onClick={exportCsv}
                  type="button"
                >
                  CSV
                </button>
              ) : null}
            </div>
            <div className="max-h-36 overflow-y-auto">
              {trials.length === 0 ? (
                <div className="text-zinc-500">Run a 20s trial to score taste.</div>
              ) : (
                trials.map((row) => (
                  <div key={row.id}>
                    {row.verdict.padEnd(7, " ")} {row.name}  a
                    {row.approachIndex.toFixed(2)}
                  </div>
                ))
              )}
            </div>
            <p className="mt-2 font-sans text-[10px] leading-4 text-zinc-500">
              {camMode === "free"
                ? "drag look · right-drag pan · WASD walk · Q/E up down · F follow"
                : "WASD fly · Space climb · Shift dive · C free cam · F follow · G guides · M brain · R reset"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function csv(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
