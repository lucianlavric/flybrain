"use client";
"use no memo";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  type Object3D,
} from "three";

const FLY_URL = "/models/flybody.glb";

// MuJoCo +X head / +Y left / +Z dorsal → Three +Z forward / +X right / +Y up.
const FLY_ALIGN = new Quaternion().setFromRotationMatrix(
  new Matrix4().set(0, -1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1),
);

const body = new MeshStandardMaterial({
  color: new Color("#ac5a24"),
  roughness: 0.42,
  metalness: 0.04,
});
const eye = new MeshPhysicalMaterial({
  color: new Color("#c20a04"),
  roughness: 0.12,
  metalness: 0.08,
  clearcoat: 0.7,
  clearcoatRoughness: 0.15,
});
const black = new MeshStandardMaterial({
  color: new Color("#111111"),
  roughness: 0.55,
});
const ocelli = new MeshStandardMaterial({
  color: new Color("#2a1408"),
  roughness: 0.35,
});
const pale = new MeshStandardMaterial({
  color: new Color("#cc9b62"),
  roughness: 0.5,
});
const vein = new MeshStandardMaterial({
  color: new Color("#3a1708"),
  roughness: 0.4,
});
const wing = new MeshPhysicalMaterial({
  color: new Color("#c8d8e6"),
  roughness: 0.18,
  transparent: true,
  opacity: 0.42,
  side: DoubleSide,
  depthWrite: false,
});

function paint(root: Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (!obj.geometry.getAttribute("normal")) {
      obj.geometry.computeVertexNormals();
    }
    const name = obj.name;
    if (name.includes("head_red")) obj.material = eye;
    else if (name.includes("membrane")) obj.material = wing;
    else if (name.includes("ocelli")) obj.material = ocelli;
    else if (name.includes("black") || name.includes("bristle")) {
      obj.material = black;
    } else if (name.includes("lower")) obj.material = pale;
    else if (name.includes("brown")) obj.material = vein;
    else obj.material = body;
  });
}

const POSE = [
  "abdomen",
  "head",
  "antenna_left",
  "antenna_right",
  "wing_left",
  "wing_right",
] as const;

export function FlyingFruitFly({
  energy,
  hear,
  showAxes = true,
}: {
  energy: MutableRefObject<number>;
  hear: MutableRefObject<{ intensity: number; valence: number }>;
  showAxes?: boolean;
}) {
  const { scene } = useGLTF(FLY_URL, false, false);
  const flyRoot = useMemo(() => {
    const cloned = scene.clone(true);
    paint(cloned);
    return cloned;
  }, [scene]);
  const rest = useRef<Map<string, Quaternion>>(new Map());

  useLayoutEffect(() => {
    const next = new Map<string, Quaternion>();
    for (const name of POSE) {
      const node = flyRoot.getObjectByName(name);
      if (node) next.set(name, node.quaternion.clone());
    }
    rest.current = next;
  }, [flyRoot]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const poses = rest.current;
    const apply = (name: string, rx: number, ry: number, rz: number) => {
      const node = flyRoot.getObjectByName(name);
      const q = poses.get(name);
      if (!node || !q) return;
      node.quaternion.copy(q);
      node.rotateX(rx);
      node.rotateY(ry);
      node.rotateZ(rz);
    };
    const flap = Math.sin(t * (26 + energy.current * 28)) * 0.55;
    const twitch = hear.current.intensity;
    apply("wing_left", 0, 0, 0.35 + flap);
    apply("wing_right", 0, 0, -0.35 - flap);
    apply("abdomen", Math.sin(t * 9) * 0.04, 0, 0);
    apply("head", twitch * 0.08, Math.sin(t * 3.1) * 0.04, 0);
    apply(
      "antenna_left",
      0.12 + Math.sin(t * (8 + twitch * 22)) * (0.05 + twitch * 0.22),
      0,
      twitch * 0.08,
    );
    apply(
      "antenna_right",
      0.12 + Math.sin(t * (8 + twitch * 22) + 0.5) * (0.05 + twitch * 0.22),
      0,
      -twitch * 0.08,
    );
  });

  return (
    <>
      <group rotation={[0, 0, Math.PI / 2]}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <group quaternion={FLY_ALIGN} scale={2.35}>
            <primitive object={flyRoot} />
          </group>
        </group>
      </group>
      {showAxes ? <FlyAxes /> : null}
    </>
  );
}

function FlyAxes() {
  return (
    <group>
      <AxisArrow color="#ff2d2d" rotation={[0, 0, -Math.PI / 2]} />
      <AxisArrow color="#2ee66b" rotation={[0, 0, 0]} />
      <AxisArrow color="#2d7dff" rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function AxisArrow({
  color,
  rotation,
}: {
  color: string;
  rotation: [number, number, number];
}) {
  return (
    <group rotation={rotation}>
      <mesh position={[0, 0.48, 0]} renderOrder={12}>
        <cylinderGeometry args={[0.02, 0.02, 0.96, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh position={[0, 1.04, 0]} renderOrder={12}>
        <coneGeometry args={[0.06, 0.18, 10]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload(FLY_URL, false, false);
