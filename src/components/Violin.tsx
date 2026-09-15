"use client";
"use no memo";

import { useMemo } from "react";
import { DoubleSide, ExtrudeGeometry, Path, Shape } from "three";

/** 4/4 violin in metres. Local space: +Y toward the scroll, +Z through the ribs. */
const BODY = 0.356;
const UPPER = 0.168;
const CB = 0.112;
const LOWER = 0.208;
const RIB = 0.031;
const NECK = 0.13;
const BOARD = 0.27;

const varnish = "#7a3f1c";
const varnishDark = "#4a2412";
const ebony = "#161210";
const maple = "#c4a36a";
const hair = "#f4efe4";
const steel = "#c5c8cc";
const gut = "#d9c27a";

function bodyOutline() {
  const shape = new Shape();
  const L = BODY;
  const xL = LOWER / 2;
  const xC = CB / 2;
  const xU = UPPER / 2;
  shape.moveTo(0, 0);
  shape.bezierCurveTo(xL * 0.45, 0.004, xL, 0.04 * L, xL, 0.17 * L);
  shape.bezierCurveTo(xL, 0.3 * L, xL * 0.62, 0.36 * L, xL * 0.42, 0.385 * L);
  shape.bezierCurveTo(xC * 1.15, 0.41 * L, xC, 0.46 * L, xC, 0.5 * L);
  shape.bezierCurveTo(xC, 0.55 * L, xC * 1.15, 0.59 * L, xL * 0.38, 0.62 * L);
  shape.bezierCurveTo(xU * 0.7, 0.655 * L, xU, 0.7 * L, xU, 0.78 * L);
  shape.bezierCurveTo(xU, 0.9 * L, xU * 0.55, 0.97 * L, 0.02, L);
  shape.lineTo(-0.02, L);
  shape.bezierCurveTo(-xU * 0.55, 0.97 * L, -xU, 0.9 * L, -xU, 0.78 * L);
  shape.bezierCurveTo(-xU, 0.7 * L, -xU * 0.7, 0.655 * L, -xL * 0.38, 0.62 * L);
  shape.bezierCurveTo(-xC * 1.15, 0.59 * L, -xC, 0.55 * L, -xC, 0.5 * L);
  shape.bezierCurveTo(-xC, 0.46 * L, -xC * 1.15, 0.41 * L, -xL * 0.42, 0.385 * L);
  shape.bezierCurveTo(-xL * 0.62, 0.36 * L, -xL, 0.3 * L, -xL, 0.17 * L);
  shape.bezierCurveTo(-xL, 0.04 * L, -xL * 0.45, 0.004, 0, 0);
  return shape;
}

function addFHoles(shape: Shape) {
  const stem = (sign: number) => {
    const hole = new Path();
    const x = sign * 0.033;
    hole.moveTo(x - sign * 0.003, 0.15);
    hole.bezierCurveTo(
      x - sign * 0.012,
      0.172,
      x + sign * 0.01,
      0.208,
      x + sign * 0.002,
      0.232,
    );
    hole.lineTo(x + sign * 0.007, 0.232);
    hole.bezierCurveTo(
      x + sign * 0.016,
      0.208,
      x - sign * 0.006,
      0.172,
      x + sign * 0.002,
      0.15,
    );
    hole.closePath();
    return hole;
  };
  const eye = (sign: number, y: number, rx: number, ry: number) => {
    const hole = new Path();
    hole.absellipse(sign * 0.036, y, rx, ry, 0, Math.PI * 2, false, 0);
    return hole;
  };
  shape.holes.push(
    stem(1),
    stem(-1),
    eye(1, 0.138, 0.008, 0.01),
    eye(-1, 0.138, 0.008, 0.01),
    eye(1, 0.248, 0.007, 0.009),
    eye(-1, 0.248, 0.007, 0.009),
  );
}

function bridgeShape() {
  const shape = new Shape();
  shape.moveTo(-0.021, 0);
  shape.lineTo(-0.018, 0.018);
  shape.lineTo(-0.012, 0.02);
  shape.lineTo(-0.008, 0.027);
  shape.lineTo(-0.003, 0.028);
  shape.lineTo(0, 0.032);
  shape.lineTo(0.003, 0.028);
  shape.lineTo(0.008, 0.027);
  shape.lineTo(0.012, 0.02);
  shape.lineTo(0.018, 0.018);
  shape.lineTo(0.021, 0);
  shape.lineTo(0.014, 0);
  shape.bezierCurveTo(0.01, 0.012, 0.004, 0.012, 0, 0.008);
  shape.bezierCurveTo(-0.004, 0.012, -0.01, 0.012, -0.014, 0);
  shape.closePath();
  return shape;
}

export function Violin() {
  const ribs = useMemo(
    () => new ExtrudeGeometry(bodyOutline(), { depth: RIB, bevelEnabled: false }),
    [],
  );
  const top = useMemo(() => {
    const shape = bodyOutline();
    addFHoles(shape);
    return new ExtrudeGeometry(shape, { depth: 0.0032, bevelEnabled: false });
  }, []);
  const back = useMemo(
    () => new ExtrudeGeometry(bodyOutline(), { depth: 0.0036, bevelEnabled: false }),
    [],
  );
  const bridge = useMemo(
    () => new ExtrudeGeometry(bridgeShape(), { depth: 0.004, bevelEnabled: false }),
    [],
  );

  return (
    <group rotation={[-Math.PI / 2, Math.PI, 0]}>
      <mesh geometry={ribs} castShadow receiveShadow position={[0, 0, 0.003]}>
        <meshStandardMaterial color={varnishDark} roughness={0.45} />
      </mesh>
      <mesh geometry={top} castShadow receiveShadow position={[0, 0, RIB + 0.001]}>
        <meshPhysicalMaterial
          color={varnish}
          roughness={0.28}
          clearcoat={0.65}
          clearcoatRoughness={0.2}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={back} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={varnishDark}
          roughness={0.32}
          clearcoat={0.4}
          side={DoubleSide}
        />
      </mesh>

      <mesh position={[0, BODY + NECK * 0.48, RIB / 2]}>
        <cylinderGeometry args={[0.011, 0.015, NECK, 12]} />
        <meshStandardMaterial color={varnish} roughness={0.35} />
      </mesh>
      <mesh
        castShadow
        position={[0, BODY + NECK * 0.18, RIB + 0.01]}
        rotation={[0.05, 0, 0]}
      >
        <boxGeometry args={[0.042, BOARD, 0.006]} />
        <meshStandardMaterial color={ebony} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, BODY + NECK + 0.028, RIB / 2 + 0.006]}>
        <boxGeometry args={[0.018, 0.055, 0.022]} />
        <meshStandardMaterial color={varnish} roughness={0.32} />
      </mesh>
      <group position={[0, BODY + NECK + 0.06, RIB / 2 + 0.012]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.016, 0.0055, 8, 18, Math.PI * 1.55]} />
          <meshStandardMaterial color={varnish} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0.008, 0.012, 0.004]}>
          <sphereGeometry args={[0.0065, 12, 10]} />
          <meshStandardMaterial color={varnish} roughness={0.3} />
        </mesh>
      </group>

      <Pegs />
      <mesh
        geometry={bridge}
        castShadow
        position={[0, BODY * 0.31, RIB + 0.003]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={maple} roughness={0.5} />
      </mesh>
      <Strings />
      <Tailpiece />
      <mesh
        castShadow
        position={[-0.055, 0.05, RIB + 0.01]}
        rotation={[0.2, 0, -0.5]}
      >
        <capsuleGeometry args={[0.016, 0.04, 4, 10]} />
        <meshStandardMaterial color={ebony} roughness={0.42} />
      </mesh>
    </group>
  );
}

function Pegs() {
  const pegs = [
    { x: 0.016, y: 0.012, side: 1 },
    { x: -0.016, y: 0.0, side: -1 },
    { x: 0.016, y: -0.012, side: 1 },
    { x: -0.016, y: -0.024, side: -1 },
  ];
  return (
    <group position={[0, BODY + NECK + 0.03, RIB / 2 + 0.006]}>
      {pegs.map((peg) => (
        <group key={`${peg.side}:${peg.y}`} position={[0, peg.y, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[peg.x, 0, 0]}>
            <cylinderGeometry args={[0.0032, 0.0032, 0.032, 8]} />
            <meshStandardMaterial color={ebony} roughness={0.45} />
          </mesh>
          <mesh castShadow position={[peg.side * 0.03, 0, 0]}>
            <sphereGeometry args={[0.006, 10, 8]} />
            <meshStandardMaterial color={ebony} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Strings() {
  const xs = [-0.0135, -0.0045, 0.0045, 0.0135];
  const colors = [gut, maple, steel, steel];
          const radii = [0.0011, 0.0009, 0.0007, 0.00055];
  const y0 = 0.045;
  const y1 = BODY + NECK + 0.01;
  const len = y1 - y0;
  return (
    <group>
      {xs.map((x, i) => (
        <mesh key={x} position={[x, y0 + len / 2, RIB + 0.034]}>
          <cylinderGeometry args={[radii[i], radii[i], len, 6]} />
          <meshStandardMaterial
            color={colors[i]}
            metalness={0.45}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

function Tailpiece() {
  return (
    <group position={[0, 0.042, RIB + 0.012]}>
      <mesh castShadow>
        <boxGeometry args={[0.034, 0.068, 0.006]} />
        <meshStandardMaterial color={ebony} roughness={0.38} />
      </mesh>
      <mesh position={[0, -0.04, -0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0014, 0.0014, 0.03, 6]} />
        <meshStandardMaterial color="#8a8878" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.012, 0.018, 0.006]}>
        <cylinderGeometry args={[0.002, 0.002, 0.01, 6]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}

export function Bow() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow position={[0, 0.008, 0]} rotation={[0, 0, 0.04]}>
        <cylinderGeometry args={[0.003, 0.0024, 0.52, 8]} />
        <meshStandardMaterial color="#5b2c14" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[0, 0, 0.04]}>
        <boxGeometry args={[0.006, 0.46, 0.001]} />
        <meshStandardMaterial color={hair} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, -0.23, 0]}>
        <boxGeometry args={[0.011, 0.032, 0.012]} />
        <meshStandardMaterial color={ebony} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.248, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0028, 0.0028, 0.014, 8]} />
        <meshStandardMaterial color="#c9c3b0" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.245, 0]} rotation={[0.4, 0, 0]}>
        <coneGeometry args={[0.0045, 0.022, 8]} />
        <meshStandardMaterial color="#5b2c14" roughness={0.35} />
      </mesh>
    </group>
  );
}
