"use client";

import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";

import { stepForNames } from "@/lib/assembly/guide";
import type { Guide } from "@/lib/assembly/guide";
import { useCustomAssembly } from "@/lib/assembly/custom-store";

const CURRENT = new THREE.Color("#63c4d5");
const SELECTED = new THREE.Color("#ffffff");
const NONE = new THREE.Color("#000000");

const materialsOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material : [m.material]);

function Model({ url, guide, onNames }: { url: string; guide: Guide; onNames: (names: string[]) => void }) {
  const gltf = useGLTF(url);
  const step = useCustomAssembly((s) => s.step);
  const showAll = useCustomAssembly((s) => s.showAll);
  const selected = useCustomAssembly((s) => s.selected);
  const select = useCustomAssembly((s) => s.select);
  const bounds = useBounds();

  // Copia propia del modelo con materiales clonados: se pueden resaltar piezas sin tocar la caché.
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      const names: string[] = [];
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name) names.push(p.name);
      o.userData.step = stepForNames(guide, names);
      o.userData.label = names[0] ?? "Sin nombre";
    });
    return root;
  }, [gltf, guide]);

  useEffect(() => {
    const names = new Set<string>();
    scene.traverse((o) => o.name && o !== scene && names.add(o.name));
    onNames([...names]);
  }, [scene, onNames]);

  useEffect(() => {
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const s = o.userData.step as number;
      o.visible = showAll || s < 0 || s <= step;
      const current = !showAll && s === step;
      const isSelected = o.userData.label === selected;
      for (const m of materialsOf(o)) {
        if (!("emissive" in m) || !(m.emissive instanceof THREE.Color)) continue;
        m.emissive.copy(isSelected ? SELECTED : current ? CURRENT : NONE);
        (m as THREE.MeshStandardMaterial).emissiveIntensity = isSelected ? 0.35 : current ? 0.5 : 0;
      }
      if (o.visible) box.expandByObject(o);
    });
    if (!box.isEmpty()) bounds.refresh(box).clip().fit();
  }, [scene, step, showAll, selected, bounds]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!e.object.visible) return; // el raycaster también alcanza objetos ocultos
    e.stopPropagation();
    select(e.object.userData.label as string);
  };

  return <primitive object={scene} onClick={onClick} />;
}

export function CustomScene({ url, guide, className, onNames }: { url: string; guide: Guide; className?: string; onNames: (names: string[]) => void }) {
  const select = useCustomAssembly((s) => s.select);
  return (
    <Canvas className={className} camera={{ position: [4, 3, 5], fov: 40 }} dpr={[1, 2]} onPointerMissed={() => select(null)}>
      <hemisphereLight args={["#ffffff", "#1c1c26", 1.1]} />
      <directionalLight position={[5, 8, 6]} intensity={1.8} />
      <directionalLight position={[-6, -2, -4]} intensity={0.5} />
      <Suspense fallback={null}>
        <Bounds fit clip margin={1.8}>
          <Model url={url} guide={guide} onNames={onNames} />
        </Bounds>
      </Suspense>
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}
