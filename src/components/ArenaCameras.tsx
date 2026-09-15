"use client";
"use no memo";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type ComponentRef } from "react";
import { MathUtils, Vector3 } from "three";
import {
  ARENA_HALF,
  CEILING,
  headingVector,
  type FlyState,
} from "@/lib/sim";

export type CameraMode = "follow" | "free";

type Keys = Record<string, boolean>;

export function FollowCamera({ target }: { target: { current: FlyState } }) {
  const { camera } = useThree();
  const look = useMemo(() => new Vector3(), []);
  const pos = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const fly = target.current;
    const fwd = headingVector(fly.heading, fly.pitch);
    pos.set(
      fly.x - fwd.x * 5.2,
      MathUtils.clamp(fly.y - fwd.y * 5.2 + 1.35, 1.2, CEILING - 0.5),
      fly.z - fwd.z * 5.2,
    );
    const limit = ARENA_HALF - 0.6;
    pos.x = MathUtils.clamp(pos.x, -limit, limit);
    pos.z = MathUtils.clamp(pos.z, -limit, limit);
    camera.position.lerp(pos, 1 - Math.pow(0.001, dt));
    look.set(fly.x + fwd.x * 0.85, fly.y + fwd.y * 0.85, fly.z + fwd.z * 0.85);
    camera.lookAt(look);
  });
  return null;
}

export function FreeCamera({
  keys,
  target,
}: {
  keys: Keys;
  target: { current: FlyState };
}) {
  const { camera } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const move = useMemo(() => new Vector3(), []);
  const primed = useRef(false);

  useFrame((_, dt) => {
    const fly = target.current;
    const orbit = controls.current;
    if (!primed.current && orbit) {
      orbit.target.set(fly.x, fly.y, fly.z);
      primed.current = true;
    }

    camera.getWorldDirection(forward);
    const horiz = Math.hypot(forward.x, forward.z);
    if (horiz > 1e-4) {
      forward.x /= horiz;
      forward.z /= horiz;
      forward.y = 0;
    } else {
      forward.set(0, 0, -1);
    }
    right.set(-forward.z, 0, forward.x);

    move.set(0, 0, 0);
    if (keys.w || keys.arrowup) move.add(forward);
    if (keys.s || keys.arrowdown) move.sub(forward);
    if (keys.d || keys.arrowright) move.add(right);
    if (keys.a || keys.arrowleft) move.sub(right);
    if (keys[" "] || keys.e) move.y += 1;
    if (keys.q) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar((keys.shift ? 14 : 8) * dt);
      camera.position.add(move);
      orbit?.target.add(move);
    }

    const limit = ARENA_HALF + 6;
    camera.position.x = MathUtils.clamp(camera.position.x, -limit, limit);
    camera.position.y = MathUtils.clamp(camera.position.y, 0.35, CEILING + 8);
    camera.position.z = MathUtils.clamp(camera.position.z, -limit, limit);
  });

  return (
    <OrbitControls
      ref={controls}
      dampingFactor={0.08}
      enableDamping
      makeDefault
      maxDistance={48}
      maxPolarAngle={Math.PI - 0.05}
      minDistance={0.4}
      screenSpacePanning
    />
  );
}

export function ArenaCamera({
  mode,
  keys,
  target,
}: {
  mode: CameraMode;
  keys: Keys;
  target: { current: FlyState };
}) {
  return mode === "follow" ? (
    <FollowCamera target={target} />
  ) : (
    <FreeCamera keys={keys} target={target} />
  );
}
