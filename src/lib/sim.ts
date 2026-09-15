export type Vec3 = { x: number; y: number; z: number };

export type BoxObstacle = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
};

export const ARENA_HALF = 11;
export const CEILING = 7.2;
export const FLY_RADIUS = 0.38;
export const FLY_SPEED = 4.2;
export const FLY_TURN = 2.4;
export const FLY_PITCH = 1.8;
export const PITCH_LIMIT = 0.85;
export const RAY_COUNT = 16;
export const RAY_FOV = 2.15;
export const RAY_LENGTH = 6.5;
export const GOAL_RADIUS = 0.95;
export const EXTRA_SENSE = 6;
export const SENSORY_SIZE = RAY_COUNT + EXTRA_SENSE;

export const RAY_DIRS: { yaw: number; pitch: number }[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    yaw: -RAY_FOV / 2 + (RAY_FOV / 9) * i,
    pitch: 0,
  })),
  { yaw: -0.55, pitch: 0.48 },
  { yaw: 0, pitch: 0.55 },
  { yaw: 0.55, pitch: 0.48 },
  { yaw: -0.55, pitch: -0.48 },
  { yaw: 0, pitch: -0.55 },
  { yaw: 0.55, pitch: -0.48 },
];

export const OBSTACLES: BoxObstacle[] = [
  { x: 3.2, y: 0.7, z: -2.1, w: 2.6, h: 1.4, d: 1.3 },
  { x: -4.4, y: 2.5, z: 3.1, w: 1.4, h: 5.0, d: 1.4 },
  { x: 6.1, y: 1.6, z: 5.2, w: 1.5, h: 3.2, d: 1.5 },
  { x: -6.2, y: 0.55, z: -5.4, w: 3.1, h: 1.1, d: 1.05 },
  { x: 0.2, y: 3.4, z: 6.4, w: 3.6, h: 1.2, d: 1.2 },
  { x: -1.8, y: 1.8, z: -7.2, w: 1.2, h: 3.6, d: 1.4 },
  { x: 7.2, y: 2.2, z: -6.2, w: 1.3, h: 4.4, d: 1.3 },
];

export type Motor = {
  forward: number;
  turn: number;
  pitch: number;
};

export type FlyState = {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function wrapAngle(angle: number) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function headingVector(heading: number, pitch: number) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(heading) * cp,
    y: Math.sin(pitch),
    z: Math.cos(heading) * cp,
  };
}

export function sphereHitsBox(
  x: number,
  y: number,
  z: number,
  radius: number,
  box: BoxObstacle,
) {
  const nx = clamp(x, box.x - box.w / 2, box.x + box.w / 2);
  const ny = clamp(y, box.y - box.h / 2, box.y + box.h / 2);
  const nz = clamp(z, box.z - box.d / 2, box.z + box.d / 2);
  const dx = x - nx;
  const dy = y - ny;
  const dz = z - nz;
  return dx * dx + dy * dy + dz * dz < radius * radius;
}

export function hitsBounds(x: number, y: number, z: number, radius: number) {
  return (
    Math.abs(x) > ARENA_HALF - radius ||
    Math.abs(z) > ARENA_HALF - radius ||
    y < radius + 0.02 ||
    y > CEILING - radius
  );
}

export const NO_BOXES: BoxObstacle[] = [];

export function isBlocked(
  x: number,
  y: number,
  z: number,
  radius = FLY_RADIUS,
  boxes: readonly BoxObstacle[] = OBSTACLES,
) {
  if (hitsBounds(x, y, z, radius)) return true;
  for (const box of boxes) {
    if (sphereHitsBox(x, y, z, radius, box)) return true;
  }
  return false;
}

export function resolveMove(
  from: FlyState,
  nextX: number,
  nextY: number,
  nextZ: number,
  boxes: readonly BoxObstacle[] = OBSTACLES,
) {
  if (!isBlocked(nextX, nextY, nextZ, FLY_RADIUS, boxes)) {
    return { x: nextX, y: nextY, z: nextZ, collided: false };
  }
  if (!isBlocked(nextX, from.y, nextZ, FLY_RADIUS, boxes)) {
    return { x: nextX, y: from.y, z: nextZ, collided: true };
  }
  if (!isBlocked(from.x, nextY, from.z, FLY_RADIUS, boxes)) {
    return { x: from.x, y: nextY, z: from.z, collided: true };
  }
  if (!isBlocked(nextX, nextY, from.z, FLY_RADIUS, boxes)) {
    return { x: nextX, y: nextY, z: from.z, collided: true };
  }
  if (!isBlocked(from.x, nextY, nextZ, FLY_RADIUS, boxes)) {
    return { x: from.x, y: nextY, z: nextZ, collided: true };
  }
  if (!isBlocked(nextX, from.y, from.z, FLY_RADIUS, boxes)) {
    return { x: nextX, y: from.y, z: from.z, collided: true };
  }
  if (!isBlocked(from.x, from.y, nextZ, FLY_RADIUS, boxes)) {
    return { x: from.x, y: from.y, z: nextZ, collided: true };
  }
  return { x: from.x, y: from.y, z: from.z, collided: true };
}

export function integrateFly(
  state: FlyState,
  motor: Motor,
  dt: number,
  boxes: readonly BoxObstacle[] = OBSTACLES,
) {
  const forward = clamp(motor.forward, -0.35, 1);
  const turn = clamp(motor.turn, -1, 1);
  const pitchCmd = clamp(motor.pitch, -1, 1);
  const heading = wrapAngle(state.heading + turn * FLY_TURN * dt);
  const pitch = clamp(
    state.pitch + pitchCmd * FLY_PITCH * dt,
    -PITCH_LIMIT,
    PITCH_LIMIT,
  );
  const dir = headingVector(heading, pitch);
  const step = forward * FLY_SPEED * dt;
  const moved = resolveMove(
    state,
    state.x + dir.x * step,
    state.y + dir.y * step,
    state.z + dir.z * step,
    boxes,
  );
  return {
    x: moved.x,
    y: moved.y,
    z: moved.z,
    heading,
    pitch,
    collided: moved.collided,
  };
}

export function rayHit(
  origin: FlyState,
  yawOff: number,
  pitchOff: number,
  boxes: readonly BoxObstacle[] = OBSTACLES,
) {
  const dir = headingVector(origin.heading + yawOff, origin.pitch + pitchOff);
  const steps = 28;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = origin.x + dir.x * RAY_LENGTH * t;
    const y = origin.y + dir.y * RAY_LENGTH * t;
    const z = origin.z + dir.z * RAY_LENGTH * t;
    if (isBlocked(x, y, z, 0.08, boxes)) return t;
  }
  return 1;
}

export function sense(
  state: FlyState,
  goal: Vec3,
  boxes: readonly BoxObstacle[] = OBSTACLES,
) {
  const rays = RAY_DIRS.map((dir) =>
    rayHit(state, dir.yaw, dir.pitch, boxes),
  );
  const dx = goal.x - state.x;
  const dy = goal.y - state.y;
  const dz = goal.z - state.z;
  const horiz = Math.hypot(dx, dz);
  const goalAngle = wrapAngle(Math.atan2(dx, dz) - state.heading);
  const goalPitch = wrapAngle(Math.atan2(dy, Math.max(horiz, 0.05)) - state.pitch);
  const goalDist = Math.hypot(dx, dy, dz);
  return { rays, goalAngle, goalPitch, goalDist };
}

export function randomFreePoint(minClear = 1.1): Vec3 {
  for (let i = 0; i < 50; i += 1) {
    const x = (Math.random() * 2 - 1) * (ARENA_HALF - 1.8);
    const y = 0.9 + Math.random() * (CEILING - 2.2);
    const z = (Math.random() * 2 - 1) * (ARENA_HALF - 1.8);
    if (!isBlocked(x, y, z, minClear)) return { x, y, z };
  }
  return { x: 6.4, y: 3.4, z: 5.8 };
}

export function reachedGoal(state: FlyState, goal: Vec3) {
  return (
    Math.hypot(state.x - goal.x, state.y - goal.y, state.z - goal.z) <
    GOAL_RADIUS
  );
}

export const START_POSE: FlyState = {
  x: 0,
  y: 1.7,
  z: -8.2,
  heading: 0.12,
  pitch: 0.18,
};
