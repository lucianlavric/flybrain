"use client";

type BrainFireProps = {
  fire: number[];
  live: boolean;
  backend: string;
  forward: number;
  turn: number;
  pitch: number;
};

const REGIONS = [
  { id: "ol-l", x: 38, y: 78, rx: 28, ry: 42, slice: [0, 16] },
  { id: "ol-r", x: 202, y: 78, rx: 28, ry: 42, slice: [16, 32] },
  { id: "mb-l", x: 88, y: 36, rx: 22, ry: 16, slice: [32, 48] },
  { id: "mb-r", x: 152, y: 36, rx: 22, ry: 16, slice: [48, 64] },
  { id: "cx", x: 120, y: 78, rx: 34, ry: 28, slice: [64, 80] },
  { id: "al", x: 120, y: 118, rx: 26, ry: 16, slice: [80, 88] },
  { id: "vnc", x: 120, y: 158, rx: 18, ry: 22, slice: [88, 96] },
] as const;

function mean(fire: number[], start: number, end: number) {
  const span = fire.slice(start, end);
  if (span.length === 0) return 0;
  return span.reduce((sum, value) => sum + value, 0) / span.length;
}

export function BrainFire({
  fire,
  live,
  backend,
  forward,
  turn,
  pitch,
}: BrainFireProps) {
  return (
    <div className="pointer-events-none mt-3 w-[240px] rounded-xl bg-black/55 p-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[10px] tracking-[0.16em] text-zinc-500 uppercase">
          Brain firing
        </p>
        <p className={live ? "text-[10px] text-amber-300" : "text-[10px] text-zinc-500"}>
          {live ? backend : "warming"}
        </p>
      </div>
      <svg className="mt-1 h-[168px] w-full" viewBox="0 0 240 190" aria-hidden>
        {REGIONS.map((region) => {
          const glow = mean(fire, region.slice[0], region.slice[1]);
          return (
            <ellipse
              cx={region.x}
              cy={region.y}
              fill={`rgba(251, 191, 36, ${0.08 + glow * 0.72})`}
              key={region.id}
              rx={region.rx}
              ry={region.ry}
              stroke={`rgba(251, 191, 36, ${0.25 + glow * 0.65})`}
              strokeWidth={1.2}
            />
          );
        })}
        {fire.map((value, i) => {
          const region = REGIONS[Math.min(REGIONS.length - 1, Math.floor(i / 16))] ?? REGIONS[4];
          const ox = ((i * 17) % 21) - 10;
          const oy = ((i * 11) % 17) - 8;
          return (
            <circle
              cx={region.x + ox}
              cy={region.y + oy}
              fill={`rgba(255, 236, 180, ${0.15 + value * 0.85})`}
              key={i}
              r={1.15 + value * 1.6}
            />
          );
        })}
      </svg>
      <p className="px-0.5 text-[10px] leading-4 text-zinc-500">
        OL · MB · CX · AL · VNC
      </p>
      <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10px] text-zinc-400">
        <span>fwd {forward.toFixed(2)}</span>
        <span>turn {turn.toFixed(2)}</span>
        <span>climb {pitch.toFixed(2)}</span>
      </div>
    </div>
  );
}
