"use client";
"use no memo";

import { Grid } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  Color,
  DoubleSide,
  Group,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Mesh,
} from "three";
import { ArenaCamera, type CameraMode } from "@/components/ArenaCameras";
import { FlyingFruitFly } from "@/components/FlyingFruitFly";
import type { BrainStep } from "@/lib/brain";
import {
  SPEAKER,
  hear,
  type AudioSnap,
  type Stimulus,
} from "@/lib/hearing";
import type { SoundLab } from "@/lib/sound-lab";
import {
  ARENA_HALF,
  CEILING,
  OBSTACLES,
  RAY_COUNT,
  RAY_DIRS,
  RAY_LENGTH,
  START_POSE,
  headingVector,
  integrateFly,
  sense,
  wrapAngle,
  type FlyState,
  type Motor,
} from "@/lib/sim";

type Keys = Record<string, boolean>;

export type ArenaHud = {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  forward: number;
  turn: number;
  climb: number;
  energy: number;
  collided: boolean;
  dist: number;
  intensity: number;
  valence: number;
  hz: number;
  joGain: number;
  approach: number;
};

type FlyArenaProps = {
  mode: "brain" | "manual";
  motor: MutableRefObject<Motor>;
  energy: MutableRefObject<number>;
  keys: Keys;
  lab: SoundLab;
  stimulus: Stimulus | null;
  playing: boolean;
  dose: number;
  onSense: (payload: BrainStep) => void;
  onHud: (hud: ArenaHud) => void;
  resetToken: number;
  camMode: CameraMode;
  showGizmos: boolean;
};

export function FlyArena({
  mode,
  motor,
  energy,
  keys,
  lab,
  stimulus,
  playing,
  dose,
  onSense,
  onHud,
  resetToken,
  camMode,
  showGizmos,
}: FlyArenaProps) {
  const fly = useRef<FlyState>({ ...START_POSE });
  const collided = useRef(false);
  const rays = useRef<number[]>(Array(RAY_COUNT).fill(1));
  const group = useRef<Group>(null);
  const senseClock = useRef(0);
  const hudClock = useRef(0);
  const heard = useRef({ intensity: 0, valence: 0 });

  useEffect(() => {
    fly.current = { ...START_POSE };
    collided.current = false;
  }, [resetToken]);

  useFrame((_, dt) => {
    const capped = Math.min(dt, 0.05);
    const command =
      mode === "manual" && camMode === "follow"
        ? {
            forward: keys.w ? 1 : keys.s ? -0.25 : 0.15,
            turn: (keys.a ? 1 : 0) - (keys.d ? 1 : 0),
            pitch:
              (keys[" "] || keys.arrowup ? 1 : 0) -
              (keys.shift || keys.arrowdown ? 1 : 0),
          }
        : motor.current;
    const next = integrateFly(fly.current, command, capped);
    fly.current = {
      x: next.x,
      y: next.y,
      z: next.z,
      heading: next.heading,
      pitch: next.pitch,
    };
    collided.current = next.collided;
    if (group.current) {
      group.current.position.set(fly.current.x, fly.current.y, fly.current.z);
      group.current.rotation.order = "YXZ";
      group.current.rotation.set(-fly.current.pitch, fly.current.heading, 0);
    }
    lab.setListener(fly.current);
    lab.setSource(SPEAKER);
    const snap: AudioSnap = playing
      ? lab.snapshot(stimulus)
      : {
          hz: 0,
          rms: 0,
          roughness: 0,
          courtship: 0,
          bars: [],
        };
    const felt = hear(fly.current, SPEAKER, snap, dose);
    heard.current = { intensity: felt.intensity, valence: felt.valence };
    senseClock.current += capped;
    if (senseClock.current >= 1 / 20) {
      const dtSense = senseClock.current;
      senseClock.current = 0;
      const walls = sense(fly.current, SPEAKER);
      rays.current = walls.rays;
      const live = felt.intensity > 0.05;
      const flee = felt.valence < -0.12;
      onSense({
        rays: walls.rays,
        goalAngle: live
          ? flee
            ? wrapAngle(felt.bearing + Math.PI)
            : felt.bearing
          : 0,
        goalPitch: live ? felt.elevation * (flee ? -1 : 1) : 0,
        goalDist: felt.dist,
        altitude: fly.current.y,
        collided: collided.current,
        dt: dtSense,
        audio: felt,
      });
    }
    hudClock.current += capped;
    if (hudClock.current >= 0.1) {
      hudClock.current = 0;
      onHud({
        x: fly.current.x,
        y: fly.current.y,
        z: fly.current.z,
        heading: fly.current.heading,
        pitch: fly.current.pitch,
        forward: command.forward,
        turn: command.turn,
        climb: command.pitch,
        energy: energy.current,
        collided: collided.current,
        dist: felt.dist,
        intensity: felt.intensity,
        valence: felt.valence,
        hz: felt.hz,
        joGain: felt.joGain,
        approach: felt.approach,
      });
    }
  });

  return (
    <>
      <color attach="background" args={["#1a222c"]} />
      <fog attach="fog" args={["#1a222c", 28, 56]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#f3f6fa", "#4a4034", 1.35]} />
      <directionalLight position={[8, 14, 6]} intensity={2.1} color="#fff6e8" />
      <pointLight
        position={[SPEAKER.x, SPEAKER.y + 0.6, SPEAKER.z]}
        color="#f2b056"
        intensity={playing ? 12 : 5}
        distance={16}
      />
      <Floor />
      <Walls />
      {OBSTACLES.map((box) => (
        <mesh
          key={`${box.x}:${box.y}:${box.z}`}
          position={[box.x, box.y, box.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[box.w, box.h, box.d]} />
          <meshStandardMaterial
            color="#2a3038"
            roughness={0.86}
            metalness={0.08}
          />
        </mesh>
      ))}
      <SpeakerMesh heard={heard} playing={playing} />
      <group ref={group}>
        <Suspense fallback={<FlyMesh energy={energy} />}>
          <FlyingFruitFly energy={energy} hear={heard} showAxes={showGizmos} />
        </Suspense>
        {showGizmos ? <RayFan rays={rays} /> : null}
      </group>
      <ArenaCamera keys={keys} mode={camMode} target={fly} />
    </>
  );
}

function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF * 2 + 2, ARENA_HALF * 2 + 2]} />
        <meshStandardMaterial color="#1c222b" roughness={0.95} />
      </mesh>
      <Grid
        args={[ARENA_HALF * 2, ARENA_HALF * 2]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#24303a"
        sectionSize={4}
        sectionThickness={1.1}
        sectionColor="#3d4c58"
        fadeDistance={36}
        fadeStrength={1}
        infiniteGrid={false}
        position={[0, 0.01, 0]}
      />
    </>
  );
}

function Walls() {
  const h = CEILING;
  const t = 0.28;
  const s = ARENA_HALF * 2;
  const posts = [
    { x: 0, z: ARENA_HALF, w: s + t, d: t },
    { x: 0, z: -ARENA_HALF, w: s + t, d: t },
    { x: ARENA_HALF, z: 0, w: t, d: s + t },
    { x: -ARENA_HALF, z: 0, w: t, d: s + t },
  ];
  return (
    <group>
      {posts.map((p) => (
        <mesh key={`${p.x}:${p.z}`} position={[p.x, h / 2, p.z]}>
          <boxGeometry args={[p.w, h, p.d]} />
          <meshStandardMaterial
            color="#1c2228"
            roughness={0.9}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

function SpeakerMesh({
  heard,
  playing,
}: {
  heard: { current: { intensity: number; valence: number } };
  playing: boolean;
}) {
  const cone = useRef<Group>(null);
  const skin = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!cone.current) return;
    cone.current.scale.setScalar(
      playing ? 1 + heard.current.intensity * 0.16 * Math.sin(clock.elapsedTime * 10) : 1,
    );
    if (!skin.current) return;
    const hex = !playing
      ? "#8b9098"
      : heard.current.valence >= 0.12
        ? "#7dce82"
        : heard.current.valence <= -0.12
          ? "#f07167"
          : "#f2b056";
    skin.current.color.set(hex);
    skin.current.emissive.set(hex);
    skin.current.emissiveIntensity = playing ? 1.3 : 0.25;
  });
  return (
    <group position={[SPEAKER.x, SPEAKER.y, SPEAKER.z]} ref={cone}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.38, 0.72, 0.42, 24]} />
        <meshStandardMaterial
          ref={skin}
          color="#8b9098"
          emissive="#8b9098"
          emissiveIntensity={0.25}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
        <meshStandardMaterial color="#2a3038" roughness={0.8} />
      </mesh>
    </group>
  );
}

function FlyMesh({ energy }: { energy: MutableRefObject<number> }) {
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
  const bronze = useMemo(() => new Color("#6a4a28"), []);
  useFrame(({ clock }) => {
    const flap = Math.sin(clock.elapsedTime * (22 + energy.current * 24)) * 0.62;
    if (left.current) left.current.rotation.z = 0.45 + flap;
    if (right.current) right.current.rotation.z = -0.45 - flap;
  });
  return (
    <group>
      <mesh position={[0, 0.02, -0.18]} rotation={[0.25, 0, 0]}>
        <capsuleGeometry args={[0.09, 0.22, 6, 12]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.55} />
      </mesh>
      <mesh>
        <capsuleGeometry args={[0.12, 0.16, 6, 12]} />
        <meshStandardMaterial color={bronze} roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.04, 0.2]}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial color="#2c2118" roughness={0.45} />
      </mesh>
      <mesh position={[-0.07, 0.08, 0.24]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color="#15120f" />
      </mesh>
      <mesh position={[0.07, 0.08, 0.24]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color="#15120f" />
      </mesh>
      <mesh ref={left} position={[-0.04, 0.12, 0]} rotation={[0.2, 0.2, 0.4]}>
        <planeGeometry args={[0.42, 0.18]} />
        <meshStandardMaterial
          color="#c9d6c2"
          transparent
          opacity={0.45}
          side={DoubleSide}
          roughness={0.2}
        />
      </mesh>
      <mesh ref={right} position={[0.04, 0.12, 0]} rotation={[0.2, -0.2, -0.4]}>
        <planeGeometry args={[0.42, 0.18]} />
        <meshStandardMaterial
          color="#c9d6c2"
          transparent
          opacity={0.45}
          side={DoubleSide}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

function RayFan({ rays }: { rays: { current: number[] } }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < RAY_COUNT; i += 1) {
      const mesh = meshes.current[i];
      const dir = RAY_DIRS[i];
      if (!mesh || !dir) continue;
      const hit = rays.current[i] ?? 1;
      const len = Math.max(0.05, RAY_LENGTH * hit);
      const v = headingVector(dir.yaw, dir.pitch);
      mesh.scale.set(1, 1, len);
      mesh.position.set(v.x * (len / 2), v.y * (len / 2), v.z * (len / 2));
      mesh.rotation.set(-dir.pitch, dir.yaw, 0);
      const mat = mesh.material;
      if (mat instanceof MeshBasicMaterial) {
        mat.color.setHSL(MathUtils.lerp(0.02, 0.33, hit), 0.75, 0.48);
      }
    }
  });
  return (
    <group>
      {Array.from({ length: RAY_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(node) => {
            meshes.current[i] = node;
          }}
        >
          <boxGeometry args={[0.008, 0.008, 1]} />
          <meshBasicMaterial transparent opacity={0.28} />
        </mesh>
      ))}
    </group>
  );
}

