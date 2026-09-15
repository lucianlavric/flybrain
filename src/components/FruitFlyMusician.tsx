"use client";
"use no memo";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Box3,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  type Object3D,
} from "three";
import { Bow, Violin } from "@/components/Violin";

const FLY_URL = "/models/flybody.glb";

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

function part(root: Object3D, name: string) {
  return root.getObjectByName(name);
}

function FollowBone({
  bone,
  children,
}: {
  bone: Object3D | undefined;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const sync = () => {
    const group = ref.current;
    if (!group || !bone) return;
    bone.updateWorldMatrix(true, false);
    group.matrix.copy(bone.matrixWorld);
    group.matrixAutoUpdate = false;
  };
  useLayoutEffect(sync, [bone]);
  useFrame(sync, 1);
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

const ANIMATED = [
  "coxa_T1_left",
  "femur_T1_left",
  "tibia_T1_left",
  "tarsus_T1_left",
  "coxa_T1_right",
  "femur_T1_right",
  "tibia_T1_right",
  "tarsus_T1_right",
  "abdomen",
  "head",
  "antenna_left",
  "antenna_right",
] as const;

export function FruitFlyMusician() {
  const { scene } = useGLTF(FLY_URL, false, false);
  const flyRoot = useMemo(() => {
    const cloned = scene.clone(true);
    paint(cloned);
    return cloned;
  }, [scene]);
  const flyGroup = useRef<Group>(null);
  const rest = useRef<Map<string, Quaternion>>(new Map());
  const grounded = useRef(false);

  useLayoutEffect(() => {
    const next = new Map<string, Quaternion>();
    for (const name of ANIMATED) {
      const node = part(flyRoot, name);
      if (node) next.set(name, node.quaternion.clone());
    }
    rest.current = next;
    grounded.current = false;
  }, [flyRoot]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const poses = rest.current;
    const apply = (name: string, rx: number, ry: number, rz: number) => {
      const node = part(flyRoot, name);
      const q = poses.get(name);
      if (!node || !q) return;
      node.quaternion.copy(q);
      node.rotateX(rx);
      node.rotateY(ry);
      node.rotateZ(rz);
    };
    const bow = Math.sin(t * 2.1);
    apply("coxa_T1_left", 0.55, 0.45, 0.7);
    apply("femur_T1_left", 0.65, 0.2, 0.28);
    apply("tibia_T1_left", -0.7, 0.1, 0.08);
    apply("tarsus_T1_left", 0.25, 0, 0.08);
    apply("coxa_T1_right", 0.45, -0.4, 0.55 + bow * 0.2);
    apply("femur_T1_right", 0.5 + bow * 0.12, -0.12, 0.1);
    apply("tibia_T1_right", -0.55 + bow * 0.1, 0, 0.04);
    apply("tarsus_T1_right", 0.2, 0, -0.06);
    apply("abdomen", Math.sin(t * 2.1) * 0.02, 0, 0);
    apply("head", 0, 0, Math.sin(t * 1.05) * 0.03);
    apply("antenna_left", Math.sin(t * 6.2) * 0.06, 0, 0);
    apply("antenna_right", Math.sin(t * 6.2 + 0.4) * 0.06, 0, 0);

    if (flyGroup.current && !grounded.current) {
      flyGroup.current.updateWorldMatrix(true, true);
      const box = new Box3().setFromObject(flyGroup.current);
      if (Number.isFinite(box.min.y) && Math.abs(box.min.y) < 5) {
        flyGroup.current.position.y -= box.min.y;
        grounded.current = true;
      }
    }
  });

  const leftClaw = part(flyRoot, "claw_T1_left");
  const rightClaw = part(flyRoot, "claw_T1_right");

  return (
    <group>
      <group
        ref={flyGroup}
        position={[0, 0.2, 0]}
        rotation={[-Math.PI / 2, 0.55, 0.85]}
        scale={1.7}
      >
        <primitive object={flyRoot} />
      </group>
      <FollowBone bone={leftClaw}>{null}</FollowBone>
      <FollowBone bone={rightClaw}>{null}</FollowBone>
    </group>
  );
}

useGLTF.preload(FLY_URL, false, false);
