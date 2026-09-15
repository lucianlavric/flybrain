import { clamp, wrapAngle, type FlyState, type Vec3 } from "./sim";

export type TasteGuess = "attract" | "repel" | "ignore";

export type StimulusKind =
  | "tone"
  | "pulse-song"
  | "sine-song"
  | "noise"
  | "pink"
  | "stack"
  | "harsh"
  | "file"
  | "song";

export type Stimulus = {
  id: string;
  name: string;
  note: string;
  kind: StimulusKind;
  hz: number;
  roughness: number;
  courtship: number;
  color: string;
  tag: string;
};

export type AudioSnap = {
  hz: number;
  rms: number;
  roughness: number;
  courtship: number;
  bars: number[];
};

export type HeardSound = {
  intensity: number;
  valence: number;
  bearing: number;
  elevation: number;
  dist: number;
  hz: number;
  joGain: number;
  approach: number;
};

export const SPEAKER: Vec3 = { x: 0, y: 2.05, z: 7.35 };

export const TASTE_START: FlyState = {
  x: 0.15,
  y: 1.85,
  z: -8.1,
  heading: 0.02,
  pitch: 0.06,
};

export const NEAR_FIELD = 3.1;
export const TRIAL_SEC = 20;

export const SONGS: Stimulus[] = [
  {
    id: "nectar",
    name: "Nectar",
    note: "Slow pentatonic in the 196–294 Hz band. Soft sine, courtship-adjacent. The fly should treat this as food-music.",
    kind: "song",
    hz: 220,
    roughness: 0.08,
    courtship: 0.82,
    color: "#f2b056",
    tag: "library",
  },
  {
    id: "swing",
    name: "Sugar swing",
    note: "Walking bass at 110 Hz plus a triangle tune up through 370 Hz. Some energy the antenna hears, some it doesn't.",
    kind: "song",
    hz: 247,
    roughness: 0.22,
    courtship: 0.28,
    color: "#8ec5c5",
    tag: "library",
  },
  {
    id: "scrap",
    name: "Scrap yard",
    note: "Square leaps and grit in the hearing band. Structured enough to be a song, rough enough to be a candidate repellent.",
    kind: "song",
    hz: 300,
    roughness: 0.84,
    courtship: 0.06,
    color: "#f07167",
    tag: "library",
  },
];

export const STIMULI: Stimulus[] = [
  ...SONGS,
  {
    id: "pulse",
    name: "Courtship pulse",
    note: "Male Drosophila pulse song. Carrier ~180 Hz, ~35 ms between pulses. This is what a female fly is built to hear.",
    kind: "pulse-song",
    hz: 180,
    roughness: 0.18,
    courtship: 1,
    color: "#f2b056",
    tag: "courtship",
  },
  {
    id: "sine-song",
    name: "Courtship sine",
    note: "The humming half of courtship song, around 160 Hz. Soft, tonal, in the Johnston's organ sweet spot.",
    kind: "sine-song",
    hz: 160,
    roughness: 0.05,
    courtship: 0.92,
    color: "#e7c27a",
    tag: "courtship",
  },
  {
    id: "wingbeat",
    name: "Wingbeat",
    note: "Flight tone near 200 Hz. Same organ that hears courtship also feels nearby wingbeats.",
    kind: "tone",
    hz: 200,
    roughness: 0.04,
    courtship: 0.7,
    color: "#d9a066",
    tag: "JO peak",
  },
  {
    id: "jazz",
    name: "Soft fifths",
    note: "Stacked harmonics at 220 / 330 / 440. Some energy in the hearing band, not a courtship pattern.",
    kind: "stack",
    hz: 220,
    roughness: 0.12,
    courtship: 0.28,
    color: "#8ec5c5",
    tag: "music",
  },
  {
    id: "a4",
    name: "Concert A",
    note: "440 Hz sine. Edge of the fly's useful hearing. More 'heard' than liked.",
    kind: "tone",
    hz: 440,
    roughness: 0.04,
    courtship: 0.12,
    color: "#9bb0c7",
    tag: "JO edge",
  },
  {
    id: "bass",
    name: "Subwoofer",
    note: "60 Hz. Below the antenna's particle-velocity band. A fly is almost deaf to this.",
    kind: "tone",
    hz: 60,
    roughness: 0.04,
    courtship: 0,
    color: "#6b7280",
    tag: "below hearing",
  },
  {
    id: "whine",
    name: "Mosquito whine",
    note: "1 kHz tone. Johnston's organ is already rolling off. Weak, annoying if loud.",
    kind: "tone",
    hz: 1000,
    roughness: 0.08,
    courtship: 0,
    color: "#a78bfa",
    tag: "JO roll-off",
  },
  {
    id: "ultra",
    name: "Ultrasonic gadget",
    note: "8 kHz. Commercial 'pest devices' live up here. Drosophila does not. Expected: ignore.",
    kind: "tone",
    hz: 8000,
    roughness: 0.02,
    courtship: 0,
    color: "#64748b",
    tag: "deaf band",
  },
  {
    id: "buzz",
    name: "Harsh buzz",
    note: "Square wave at 300 Hz plus grit. In-band, but rough. Candidate for a repellent.",
    kind: "harsh",
    hz: 300,
    roughness: 0.86,
    courtship: 0.08,
    color: "#f07167",
    tag: "rough JO",
  },
  {
    id: "white",
    name: "White noise",
    note: "Energy smeared across the hearing band. No courtship structure. Usually aversive.",
    kind: "noise",
    hz: 250,
    roughness: 1,
    courtship: 0,
    color: "#fb7185",
    tag: "broadband",
  },
  {
    id: "pink",
    name: "Pink noise",
    note: "1/f noise. Softer than white, still unstructured. Mild avoid.",
    kind: "pink",
    hz: 180,
    roughness: 0.78,
    courtship: 0.04,
    color: "#fb923c",
    tag: "broadband",
  },
  {
    id: "file",
    name: "Your track",
    note: "Drop an mp3/wav. The fly hears whatever lands in 80–800 Hz, weighted like an antenna.",
    kind: "file",
    hz: 250,
    roughness: 0.4,
    courtship: 0.15,
    color: "#e5e7eb",
    tag: "upload",
  },
];

export const SILENT_SNAP: AudioSnap = {
  hz: 0,
  rms: 0,
  roughness: 0,
  courtship: 0,
  bars: Array(16).fill(0),
};

/** Johnston's organ gain. Peak ~250 Hz, useful roughly 80–1000 Hz. */
export function joGain(freqHz: number) {
  const f = Math.max(freqHz, 1);
  const octaves = Math.log2(f / 250);
  return Math.exp(-0.5 * (octaves / 0.82) ** 2);
}

export function hear(
  fly: FlyState,
  source: Vec3,
  snap: AudioSnap,
  dose: number,
): HeardSound {
  const dx = source.x - fly.x;
  const dy = source.y - fly.y;
  const dz = source.z - fly.z;
  const dist = Math.max(0.12, Math.hypot(dx, dy, dz));
  const horiz = Math.hypot(dx, dz);
  const bearing = wrapAngle(Math.atan2(dx, dz) - fly.heading);
  const elevation = wrapAngle(
    Math.atan2(dy, Math.max(horiz, 0.05)) - fly.pitch,
  );
  const approach = Math.cos(bearing) * Math.cos(elevation);
  const jo = snap.hz > 1 ? joGain(snap.hz) : 0;
  const near = 1 / (1 + dist * 0.1);
  const intensity = clamp(snap.rms * dose * near * (0.22 + jo * 0.9), 0, 1);
  let valence = 0;
  if (intensity >= 0.05 && jo > 0.04) {
    const attract = snap.courtship * jo * (1 - snap.roughness) * 1.35;
    const grit = snap.roughness * jo * intensity * 1.05;
    const tooLoud = Math.max(0, intensity - 0.74) * jo * 1.7;
    valence = clamp(attract - grit - tooLoud, -1, 1);
    if (Math.abs(valence) < 0.04) valence = -grit * 0.5;
  }
  return {
    intensity,
    valence,
    bearing,
    elevation,
    dist,
    hz: snap.hz,
    joGain: jo,
    approach,
  };
}

export function verdictFrom(approachIndex: number, nearFrac: number, meanValence: number) {
  if (meanValence > 0.18 && approachIndex > 0.18 && nearFrac > 0.22) return "attract" as const;
  if (meanValence < -0.12 || approachIndex < -0.16) return "repel" as const;
  return "ignore" as const;
}
