import { headingVector, type FlyState, type Vec3 } from "./sim";
import {
  SILENT_SNAP,
  type AudioSnap,
  type Stimulus,
} from "./hearing";

type WebAudio = AudioContext & { webkitAudioContext?: AudioContext };

function makeContext() {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctor() as WebAudio;
}

export class SoundLab {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private panner: PannerNode | null = null;
  private analyser: AnalyserNode | null = null;
  private tap: GainNode | null = null;
  private playing = false;
  private sources: AudioScheduledSourceNode[] = [];
  private extras: AudioNode[] = [];
  private timers: number[] = [];
  private fileBuffer: AudioBuffer | null = null;
  private fileName = "";
  private freqBuf: Uint8Array<ArrayBuffer> | null = null;
  private timeBuf: Uint8Array<ArrayBuffer> | null = null;
  private lastKind: Stimulus["kind"] | null = null;
  private trackBuffers = new Map<string, AudioBuffer>();
  private playSeq = 0;
  private heldRms = 0;
  listenGain = 0.22;

  get hasFile() {
    return this.fileBuffer !== null;
  }

  get uploadedName() {
    return this.fileName;
  }

  async ensure() {
    if (!this.ctx) {
      const ctx = makeContext();
      const master = ctx.createGain();
      master.gain.value = this.listenGain;
      const dry = ctx.createGain();
      dry.gain.value = 0.22;
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.4;
      panner.rolloffFactor = 1.15;
      panner.maxDistance = 28;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.68;
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(analyser);
      tap.connect(panner);
      tap.connect(dry);
      panner.connect(master);
      dry.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.dry = dry;
      this.panner = panner;
      this.analyser = analyser;
      this.tap = tap;
      this.freqBuf = new Uint8Array(analyser.frequencyBinCount);
      this.timeBuf = new Uint8Array(analyser.fftSize);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setListenGain(value: number) {
    this.listenGain = value;
    if (this.master) this.master.gain.value = value;
  }

  setListener(fly: FlyState) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dir = headingVector(fly.heading, fly.pitch);
    const listener = ctx.listener;
    listener.positionX.value = fly.x;
    listener.positionY.value = fly.y;
    listener.positionZ.value = fly.z;
    listener.forwardX.value = dir.x;
    listener.forwardY.value = dir.y;
    listener.forwardZ.value = dir.z;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  setSource(pos: Vec3) {
    if (!this.panner) return;
    this.panner.positionX.value = pos.x;
    this.panner.positionY.value = pos.y;
    this.panner.positionZ.value = pos.z;
  }

  async loadFile(file: File) {
    await this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    const raw = await file.arrayBuffer();
    this.fileBuffer = await ctx.decodeAudioData(raw.slice(0));
    this.fileName = file.name;
  }

  stop() {
    this.playing = false;
    this.playSeq += 1;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    for (const node of this.sources) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      node.disconnect();
    }
    this.sources = [];
    for (const node of this.extras) node.disconnect();
    this.extras = [];
    this.lastKind = null;
    this.heldRms = 0;
  }

  async play(stim: Stimulus) {
    await this.ensure();
    const ctx = this.ctx;
    const tap = this.tap;
    if (!ctx || !tap) return;
    this.stop();
    const seq = ++this.playSeq;
    this.playing = true;
    this.lastKind = stim.kind;
    switch (stim.kind) {
      case "tone":
        this.startTone(ctx, tap, stim.hz, "sine", 0.32);
        break;
      case "sine-song":
        this.startSineSong(ctx, tap, stim.hz);
        break;
      case "pulse-song":
        this.startPulseSong(ctx, tap, stim.hz);
        break;
      case "noise":
        this.startNoise(ctx, tap, "white", 0.22);
        break;
      case "pink":
        this.startNoise(ctx, tap, "pink", 0.28);
        break;
      case "stack":
        this.startStack(ctx, tap);
        break;
      case "harsh":
        this.startHarsh(ctx, tap, stim.hz);
        break;
      case "file":
        this.startFile(ctx, tap);
        break;
      case "song": {
        if (stim.src) {
          const buffer = await this.loadTrack(stim.id, stim.src);
          if (seq !== this.playSeq) return;
          if (buffer) {
            this.startBuffer(ctx, tap, buffer);
            break;
          }
        }
        this.startLibrarySong(ctx, tap, stim.id);
        break;
      }
    }
  }

  private async loadTrack(id: string, src: string) {
    const cached = this.trackBuffers.get(id);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(raw);
      this.trackBuffers.set(id, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  snapshot(stim: Stimulus | null): AudioSnap {
    const analyser = this.analyser;
    const freqBuf = this.freqBuf;
    const timeBuf = this.timeBuf;
    const ctx = this.ctx;
    if (!this.playing || !analyser || !freqBuf || !timeBuf || !ctx || !stim) {
      return SILENT_SNAP;
    }
    analyser.getByteFrequencyData(freqBuf);
    analyser.getByteTimeDomainData(timeBuf);
    let power = 0;
    for (let i = 0; i < timeBuf.length; i += 1) {
      const v = (timeBuf[i] - 128) / 128;
      power += v * v;
    }
    let spec = 0;
    for (let i = 0; i < freqBuf.length; i += 1) {
      const mag = (freqBuf[i] ?? 0) / 255;
      spec += mag * mag;
    }
    const instant = Math.min(
      1,
      Math.max(Math.sqrt(power / timeBuf.length) * 2.4, Math.sqrt(spec / 28)),
    );
    this.heldRms = Math.max(instant, this.heldRms * 0.86);
    const rms = this.heldRms;
    const binHz = ctx.sampleRate / analyser.fftSize;
    const bars = Array.from({ length: 16 }, (_, i) => {
      const start = Math.floor((i / 16) * freqBuf.length * 0.35);
      const end = Math.floor(((i + 1) / 16) * freqBuf.length * 0.35);
      let sum = 0;
      for (let k = start; k < end; k += 1) sum += freqBuf[k] ?? 0;
      return sum / Math.max(1, end - start) / 255;
    });
    if (stim.kind === "file" || stim.kind === "song") {
      const parsed = spectrumShape(freqBuf, binHz);
      return {
        hz: stim.kind === "song" ? stim.hz : parsed.hz,
        rms,
        roughness:
          stim.kind === "song" ? stim.roughness : parsed.roughness,
        courtship:
          stim.kind === "song" ? stim.courtship : parsed.courtship,
        bars,
      };
    }
    return {
      hz: stim.hz,
      rms,
      roughness: stim.roughness,
      courtship: stim.courtship,
      bars,
    };
  }

  private startTone(
    ctx: AudioContext,
    dest: AudioNode,
    hz: number,
    type: OscillatorType,
    gainValue: number,
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    this.sources.push(osc);
    this.extras.push(gain);
  }

  private startSineSong(ctx: AudioContext, dest: AudioNode, hz: number) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const am = ctx.createOscillator();
    am.frequency.value = 5.4;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.18;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    am.connect(amGain);
    amGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    am.start();
    this.sources.push(osc, am);
    this.extras.push(gain, amGain);
  }

  private startPulseSong(ctx: AudioContext, dest: AudioNode, hz: number) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    this.sources.push(osc);
    this.extras.push(gain);
    const pulse = 0.014;
    const ipi = 0.034;
    const beat = () => {
      if (!this.playing || !this.ctx) return;
      const t = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.85, t + 0.0012);
      gain.gain.exponentialRampToValueAtTime(0.08, t + pulse);
      this.timers.push(window.setTimeout(beat, ipi * 1000));
    };
    beat();
  }

  private startNoise(
    ctx: AudioContext,
    dest: AudioNode,
    kind: "white" | "pink",
    gainValue: number,
  ) {
    const seconds = 1.6;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") {
        data[i] = white;
      } else {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526914;
        data[i] = b0 + b1 + b2 + white * 0.1848;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(gain);
    gain.connect(dest);
    src.start();
    this.sources.push(src);
    this.extras.push(gain);
  }

  private startStack(ctx: AudioContext, dest: AudioNode) {
    const freqs = [220, 330, 440, 554];
    freqs.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.value = 0.16 / (i + 1);
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      this.sources.push(osc);
      this.extras.push(gain);
    });
  }

  private startHarsh(ctx: AudioContext, dest: AudioNode, hz: number) {
    this.startTone(ctx, dest, hz, "square", 0.12);
    this.startNoise(ctx, dest, "white", 0.08);
  }

  private startLibrarySong(ctx: AudioContext, dest: AudioNode, id: string) {
    if (id === "nectar") {
      this.startDrone(ctx, dest, 196, "sine", 0.1);
      this.startMelody(ctx, dest, {
        notes: [196, 220, 247, 220, 294, 247, 220, 196],
        step: 0.34,
        type: "sine",
        gain: 0.26,
        glide: 0.05,
      });
      return;
    }
    if (id === "swing") {
      this.startDrone(ctx, dest, 110, "triangle", 0.09);
      this.startMelody(ctx, dest, {
        notes: [220, 247, 330, 220, 277, 330, 370, 330],
        step: 0.22,
        type: "triangle",
        gain: 0.2,
        glide: 0.03,
      });
      return;
    }
    if (id === "sofia") {
      this.startDrone(ctx, dest, 90, "sine", 0.06);
      this.startMelody(ctx, dest, {
        notes: [180, 196, 220, 196, 165, 196, 220, 247],
        step: 0.4,
        type: "sine",
        gain: 0.24,
        glide: 0.06,
      });
      return;
    }
    if (id === "north") {
      this.startDrone(ctx, dest, 115, "square", 0.05);
      this.startNoise(ctx, dest, "white", 0.05);
      this.startMelody(ctx, dest, {
        notes: [230, 207, 246, 184, 230, 207, 276, 246],
        step: 0.5,
        type: "sawtooth",
        gain: 0.16,
        glide: 0.02,
      });
      return;
    }
    if (id === "delicate") {
      this.startDrone(ctx, dest, 105, "sine", 0.05);
      this.startMelody(ctx, dest, {
        notes: [210, 315, 262, 210, 157, 210, 262, 315],
        step: 0.27,
        type: "triangle",
        gain: 0.2,
        glide: 0,
      });
      return;
    }
    if (id === "readyforit") {
      this.startDrone(ctx, dest, 80, "square", 0.09);
      this.startNoise(ctx, dest, "pink", 0.07);
      this.startMelody(ctx, dest, {
        notes: [160, 160, 190, 160, 127, 160, 160, 213],
        step: 0.19,
        type: "square",
        gain: 0.14,
        glide: 0,
      });
      return;
    }
    if (id === "feeluluvme") {
      this.startDrone(ctx, dest, 120, "sine", 0.05);
      this.startNoise(ctx, dest, "pink", 0.04);
      this.startMelody(ctx, dest, {
        notes: [240, 320, 240, 360, 240, 320, 480, 360],
        step: 0.16,
        type: "triangle",
        gain: 0.22,
        glide: 0.02,
      });
      return;
    }
    if (id === "dashstar") {
      this.startDrone(ctx, dest, 95, "square", 0.08);
      this.startNoise(ctx, dest, "white", 0.1);
      this.startMelody(ctx, dest, {
        notes: [190, 95, 190, 143, 190, 95, 238, 190],
        step: 0.12,
        type: "sawtooth",
        gain: 0.16,
        glide: 0.04,
      });
      return;
    }
    this.startNoise(ctx, dest, "white", 0.06);
    this.startMelody(ctx, dest, {
      notes: [300, 180, 420, 90, 300, 510, 150, 300],
      step: 0.14,
      type: "square",
      gain: 0.11,
      glide: 0,
    });
  }

  private startDrone(
    ctx: AudioContext,
    dest: AudioNode,
    hz: number,
    type: OscillatorType,
    gainValue: number,
  ) {
    this.startTone(ctx, dest, hz, type, gainValue);
  }

  private startMelody(
    ctx: AudioContext,
    dest: AudioNode,
    spec: {
      notes: number[];
      step: number;
      type: OscillatorType;
      gain: number;
      glide: number;
    },
  ) {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.value = spec.notes[0] ?? 220;
    const gain = ctx.createGain();
    gain.gain.value = spec.gain;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    this.sources.push(osc);
    this.extras.push(gain);
    let index = 0;
    const tick = () => {
      if (!this.playing || !this.ctx) return;
      index = (index + 1) % spec.notes.length;
      const next = Math.max(spec.notes[index] ?? 220, 40);
      const t = this.ctx.currentTime;
      osc.frequency.cancelScheduledValues(t);
      if (spec.glide > 0) {
        osc.frequency.setValueAtTime(Math.max(osc.frequency.value, 40), t);
        osc.frequency.exponentialRampToValueAtTime(next, t + spec.glide);
      } else {
        osc.frequency.setValueAtTime(next, t);
      }
      this.timers.push(window.setTimeout(tick, spec.step * 1000));
    };
    this.timers.push(window.setTimeout(tick, spec.step * 1000));
  }

  private startFile(ctx: AudioContext, dest: AudioNode) {
    if (!this.fileBuffer) return;
    this.startBuffer(ctx, dest, this.fileBuffer);
  }

  private startBuffer(ctx: AudioContext, dest: AudioNode, buffer: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.55;
    src.connect(gain);
    gain.connect(dest);
    src.start();
    this.sources.push(src);
    this.extras.push(gain);
  }
}

function spectrumShape(freq: Uint8Array, binHz: number) {
  let sum = 0;
  let weighted = 0;
  let peak = 0;
  let jo = 0;
  let total = 0;
  for (let i = 1; i < freq.length; i += 1) {
    const mag = (freq[i] ?? 0) / 255;
    const hz = i * binHz;
    if (hz > 8000) break;
    sum += mag;
    weighted += mag * hz;
    total += mag;
    if (mag > peak) peak = mag;
    if (hz >= 80 && hz <= 800) jo += mag;
  }
  const hz = sum > 1e-4 ? weighted / sum : 0;
  const roughness = clamp01(1 - peak / Math.max(sum / 48, 1e-4));
  const joShare = jo / Math.max(total, 1e-4);
  const courtship =
    joGainLocal(hz) * (1 - roughness) * clamp01(joShare * 2.2);
  return { hz, roughness, courtship };
}

function joGainLocal(freqHz: number) {
  const f = Math.max(freqHz, 1);
  const octaves = Math.log2(f / 250);
  return Math.exp(-0.5 * (octaves / 0.82) ** 2);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
