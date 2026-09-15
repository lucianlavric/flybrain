"use client";
"use no memo";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";

export function ViolinStudio() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-white text-zinc-800">
      <Canvas
        className="absolute inset-0 h-full w-full"
        gl={{ antialias: true, alpha: false }}
        camera={{ fov: 34, position: [1.25, 0.4, 0.95], near: 0.02, far: 40 }}
      >
        <color attach="background" args={["#ff00aa"]} />
        <ambientLight intensity={1} />
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial color="#eeeeee" />
        </mesh>
        <OrbitControls
          makeDefault
          target={[0, 0.12, 0]}
          minDistance={0.45}
          maxDistance={5}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-6">
        <h1 className="text-xl font-medium tracking-tight text-zinc-900">
          Fruit fly with violin
        </h1>
        <Link
          className="pointer-events-auto rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white"
          href="/taste"
        >
          Sound lab
        </Link>
      </div>
    </div>
  );
}
