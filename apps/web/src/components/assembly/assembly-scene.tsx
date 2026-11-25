"use client";

import { ContactShadows, Environment, Grid, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import type { OutlineEffect } from "postprocessing";
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";

import { assemblySteps, partOrder, parts, partStep } from "@/lib/assembly-guide";
import type { PartId } from "@/lib/assembly-guide";
import { useAssemblyStore } from "@/lib/assembly-store";

import { panelFaces, partGeometry } from "./cubesat-model";
import { LookProvider } from "./materials";

/** Altura de referencia de cada pieza, para las etiquetas de la vista explosionada. */
const anchorY: Record<PartId, number> = {
  estructura: 5.7,
  eps: -4.1,
  bateria: -1.9,
  obc: -0.3,
  sensores: 1.4,
  comms: 2.9,
  camara: 4.6,
  antenas: 5.6,
  paneles: 0,
};

/** Distancia desde la que entra cada pieza al animar su paso. */
const ENTRY = 9;

const motionQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(motionQuery);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

type PartView = { look: "solid" | "ghost"; current: boolean; distance: number; hidden: boolean };

function usePartView(id: PartId): PartView {
  const mode = useAssemblyStore((s) => s.mode);
  const step = useAssemblyStore((s) => s.step);
  const explode = useAssemblyStore((s) => s.explode);
  const index = partStep[id];
  if (mode === "explosionada") return { look: "solid", current: false, distance: parts[id].spread * explode, hidden: false };
  const pending = index > step;
  // Las piezas exteriores pendientes se ocultan: su fantasma tapa la pila.
  return { look: pending ? "ghost" : "solid", current: index === step, distance: 0, hidden: pending && (id === "antenas" || id === "paneles") };
}

/**
 * Anima un escalar `s` (distancia a lo largo de la dirección de la pieza) y
 * delega en `apply` cómo convertirlo en posición.
 */
function useAnimatedDistance(view: PartView, entry: number, apply: (s: number) => void) {
  const reduced = useReducedMotion();
  const value = useRef(view.distance);
  const wasCurrent = useRef(view.current);
  const isCurrent = view.current;
  useEffect(() => {
    if (isCurrent && !wasCurrent.current && !reduced) value.current = entry;
    wasCurrent.current = isCurrent;
  }, [isCurrent, entry, reduced]);
  useFrame((_, delta) => {
    const target = view.distance;
    value.current = reduced ? target : THREE.MathUtils.damp(value.current, target, 5, delta);
    apply(value.current);
  });
}

/** Grupos raíz de cada pieza, para que el contorno sepa qué mallas resaltar. */
const PartRegistry = createContext(new Map<PartId, THREE.Group>());

function Interactive({ id, enabled, children }: { id: PartId; enabled: boolean; children: ReactNode }) {
  const registry = useContext(PartRegistry);
  const select = useAssemblyStore((s) => s.select);
  const hover = useAssemblyStore((s) => s.hover);
  const handlers = enabled
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          select(id);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          hover(id);
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          hover(null);
          document.body.style.cursor = "";
        },
      }
    : {};
  return (
    <group
      ref={(g) => {
        if (g) registry.set(id, g);
        else registry.delete(id);
      }}
      {...handlers}
    >
      {children}
    </group>
  );
}

/** Piezas resaltadas: la del paso actual, la seleccionada y la que está bajo el puntero. */
function useOutlinedParts(): PartId[] {
  const mode = useAssemblyStore((s) => s.mode);
  const step = useAssemblyStore((s) => s.step);
  const selected = useAssemblyStore((s) => s.selected);
  const hovered = useAssemblyStore((s) => s.hovered);
  const ids = new Set<PartId>();
  if (mode === "armar") assemblySteps[step].parts.forEach((id) => ids.add(id));
  for (const id of [selected, hovered]) if (id && (mode !== "armar" || partStep[id] <= step)) ids.add(id);
  return [...ids].sort();
}

// Lista estable: el `selection` por defecto de <Outline> es un arreglo nuevo en
// cada render y vaciaría la selección que se aplica a mano.
const NO_SELECTION: THREE.Object3D[] = [];

function PartOutline() {
  const registry = useContext(PartRegistry);
  const effect = useRef<OutlineEffect>(null);
  const key = useOutlinedParts().join(",");
  const cached = useRef<{ key: string; meshes: THREE.Object3D[] } | null>(null);
  // Se aplica en el bucle de render y se reaplica si algo la vacía (p. ej. el
  // remontaje de efectos en desarrollo); así las piezas ya están registradas.
  useFrame(() => {
    const outline = effect.current;
    if (!outline) return;
    if (cached.current?.key !== key) {
      const ids = key ? (key.split(",") as PartId[]) : [];
      if (ids.some((id) => !registry.has(id))) return;
      const meshes: THREE.Object3D[] = [];
      for (const id of ids) registry.get(id)?.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
      cached.current = { key, meshes };
      outline.selection.set(meshes);
    } else if (outline.selection.size !== cached.current.meshes.length) {
      outline.selection.set(cached.current.meshes);
    }
  });
  return <Outline ref={effect} selection={NO_SELECTION} visibleEdgeColor={0x63c4d5} hiddenEdgeColor={0x163a42} edgeStrength={6} blur xRay />;
}

function Label({ id, position, visible }: { id: PartId; position: [number, number, number]; visible: boolean }) {
  if (!visible) return null;
  return (
    <Html position={position} center={false} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-sm border border-white/10 bg-[#0a0a10]/80 px-2 py-0.5 font-mono text-[11px] text-[#e8e8f0]/80">
        {String(partStep[id] + 1).padStart(2, "0")} · {parts[id].name}
      </span>
    </Html>
  );
}

function StackPart({ id }: { id: Exclude<PartId, "paneles"> }) {
  const view = usePartView(id);
  const mode = useAssemblyStore((s) => s.mode);
  const group = useRef<THREE.Group>(null);
  const dir = useMemo(() => new THREE.Vector3(...parts[id].direction).normalize(), [id]);
  // En modo armar todas las piezas entran desde arriba, como en el banco de trabajo.
  const entryDir = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const armar = mode === "armar";
  useAnimatedDistance(view, id === "estructura" ? 0 : ENTRY, (s) => {
    group.current?.position.copy(armar ? entryDir : dir).multiplyScalar(s);
  });
  const Geometry = partGeometry[id];
  const labelX = id === "obc" ? 0 : -6.4;
  return (
    <group ref={group} visible={!view.hidden}>
      <LookProvider value={view.look}>
        <Interactive id={id} enabled={view.look === "solid"}>
          <Geometry />
        </Interactive>
      </LookProvider>
      <Label id={id} visible={!armar} position={[labelX, anchorY[id], id === "obc" ? 5.2 : 0]} />
    </group>
  );
}

function PanelPart() {
  const id: PartId = "paneles";
  const view = usePartView(id);
  const mode = useAssemblyStore((s) => s.mode);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useAnimatedDistance(view, 4, (s) => {
    for (const g of refs.current) if (g) g.position.x = 5.1 + s;
  });
  const Panel = partGeometry.panel;
  return (
    <group visible={!view.hidden}>
      <LookProvider value={view.look}>
        <Interactive id={id} enabled={view.look === "solid"}>
          {panelFaces.map(({ rot }, i) => (
            <group key={rot} rotation={[0, rot, 0]}>
              <group
                ref={(g) => {
                  refs.current[i] = g;
                }}
                position={[5.1, 0, 0]}
              >
                <Panel />
              </group>
            </group>
          ))}
        </Interactive>
      </LookProvider>
      <Label id={id} visible={mode !== "armar"} position={[0, 6.4, -9]} />
    </group>
  );
}

function Floor() {
  const mode = useAssemblyStore((s) => s.mode);
  const explode = useAssemblyStore((s) => s.explode);
  const y = mode === "explosionada" ? -6.4 - parts.eps.spread * explode : -6.4;
  return (
    <group position={[0, y, 0]}>
      <ContactShadows opacity={0.55} scale={26} blur={2.6} far={14} resolution={512} color="#000000" />
      <Grid
        position={[0, -0.01, 0]}
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#262833"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3a3d4c"
        fadeDistance={42}
        fadeStrength={1.6}
        infiniteGrid
      />
    </group>
  );
}

/**
 * Al cambiar de modo o de separación, acerca o aleja la cámara para que todo
 * el ensamble quepa. Solo actúa durante la transición: después el zoom es del usuario.
 */
function CameraRig() {
  const mode = useAssemblyStore((s) => s.mode);
  const explode = useAssemblyStore((s) => s.explode);
  const reduced = useReducedMotion();
  const until = useRef(0);
  const key = `${mode}:${explode}`;
  useEffect(() => {
    until.current = performance.now() + 1400;
  }, [key]);
  useFrame((state, delta) => {
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    const camera = state.camera;
    if (!controls || performance.now() > until.current) return;
    const exploded = mode === "explosionada";
    const distance = exploded ? 40 + 26 * explode : 40;
    const targetY = exploded ? 1.2 * explode : -1.2;
    const k = reduced ? 1 : 1 - Math.exp(-6 * delta);
    controls.target.setY(controls.target.y + (targetY - controls.target.y) * k);
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(offset.length() + (distance - offset.length()) * k);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  });
  return null;
}

export function AssemblyScene({ className }: { className?: string }) {
  const select = useAssemblyStore((s) => s.select);
  const registry = useMemo(() => new Map<PartId, THREE.Group>(), []);
  return (
    <Canvas
      className={className}
      shadows
      dpr={[1, 2]}
      camera={{ position: [23, 15, 26], fov: 32, near: 0.5, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => select(null)}
      fallback={
        <p className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
          Tu navegador no tiene WebGL activo; el visor 3D no puede mostrarse.
        </p>
      }
    >
      <ambientLight intensity={0.25} />
      <directionalLight position={[10, 18, 8]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-12, 6, -10]} intensity={0.5} color="#63c4d5" />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer intensity={1.2} position={[-10, 2, 6]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer intensity={0.8} color="#a78bda" position={[10, 0, -6]} rotation-y={-Math.PI / 2} scale={[10, 6, 1]} />
        <Lightformer intensity={0.6} color="#d9a650" position={[0, -6, 10]} scale={[12, 2, 1]} />
      </Environment>

      <PartRegistry.Provider value={registry}>
        <group rotation={[0, -Math.PI / 5, 0]}>
          {partOrder.map((id) => (id === "paneles" ? <PanelPart key={id} /> : <StackPart key={id} id={id} />))}
        </group>
        <EffectComposer multisampling={8} autoClear={false}>
          <PartOutline />
        </EffectComposer>
      </PartRegistry.Provider>

      <Floor />
      <CameraRig />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={12} maxDistance={60} target={[0, -1.2, 0]} />
    </Canvas>
  );
}

