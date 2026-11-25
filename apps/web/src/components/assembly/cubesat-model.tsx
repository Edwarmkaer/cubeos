"use client";

import type { ReactNode } from "react";

import type { PartId } from "@/lib/assembly-guide";

import { useMat } from "./materials";
import type { MaterialKind } from "./materials";

type V3 = [number, number, number];

function Box({ size, at, kind, rotation }: { size: V3; at: V3; kind: MaterialKind; rotation?: V3 }) {
  const mat = useMat(kind);
  return (
    <mesh position={at} rotation={rotation} material={mat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Cyl({
  r,
  h,
  at,
  kind,
  rotation,
  segments = 24,
}: {
  r: number;
  h: number;
  at: V3;
  kind: MaterialKind;
  rotation?: V3;
  segments?: number;
}) {
  const mat = useMat(kind);
  return (
    <mesh position={at} rotation={rotation} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, segments]} />
    </mesh>
  );
}

const HALF_H = 5.675; // 113,5 mm / 2
const RAIL = 0.85;
const RAIL_C = 5 - RAIL / 2;
const corners: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function Estructura() {
  const ring = (y: number) => (
    <group position={[0, y, 0]}>
      {[-1, 1].map((s) => (
        <Box key={`x${s}`} size={[8.4, 0.35, 0.7]} at={[0, 0, s * 4.55]} kind="aluminio" />
      ))}
      {[-1, 1].map((s) => (
        <Box key={`z${s}`} size={[0.7, 0.35, 8.4]} at={[s * 4.55, 0, 0]} kind="aluminio" />
      ))}
      {corners.map(([x, z]) => (
        <Box key={`${x}${z}`} size={[1.6, 0.36, 0.5]} at={[x * 3.7, 0, z * 3.7]} rotation={[0, (x * z * Math.PI) / 4, 0]} kind="aluminio" />
      ))}
    </group>
  );
  return (
    <group>
      {corners.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x * RAIL_C, 0, z * RAIL_C]}>
          <Box size={[RAIL, HALF_H * 2, RAIL]} at={[0, 0, 0]} kind="aluminio" />
          <Box size={[RAIL * 0.92, 0.25, RAIL * 0.92]} at={[0, HALF_H - 0.12, 0]} kind="anodizado" />
          <Box size={[RAIL * 0.92, 0.25, RAIL * 0.92]} at={[0, -HALF_H + 0.12, 0]} kind="anodizado" />
        </group>
      ))}
      {ring(-5.2)}
      {ring(5.2)}
      {corners.map(([x, z]) => (
        <Cyl key={`rod${x}${z}`} r={0.09} h={10.2} at={[x * 3.95, 0, z * 3.95]} kind="bateriaTapa" segments={10} />
      ))}
    </group>
  );
}

/** Tarjeta PC/104 de 90 × 90 mm con conector lateral; `children` van sobre la cara superior. */
function Board({ y, kind = "pcb", children }: { y: number; kind?: MaterialKind; children?: ReactNode }) {
  return (
    <group position={[0, y, 0]}>
      <Box size={[8.9, 0.16, 8.9]} at={[0, 0, 0]} kind={kind} />
      <Box size={[5.2, 0.85, 0.5]} at={[-0.6, 0.5, -3.7]} kind="conector" />
      {corners.map(([x, z]) => (
        <Cyl key={`${x}${z}`} r={0.28} h={0.17} at={[x * 3.95, 0.01, z * 3.95]} kind="oro" segments={14} />
      ))}
      <group position={[0, 0.08, 0]}>{children}</group>
    </group>
  );
}

function Chip({ at, size = [1, 0.18, 1] }: { at: [number, number]; size?: V3 }) {
  return <Box size={size} at={[at[0], size[1] / 2, at[1]]} kind="chip" />;
}

function EPS() {
  return (
    <Board y={-4.1}>
      <Chip at={[-2, 1]} size={[1.6, 0.2, 1.6]} />
      <Chip at={[1.5, 1.5]} />
      <Chip at={[1.5, -0.5]} size={[0.7, 0.15, 0.7]} />
      {[-2.6, -1.2, 0.2].map((x) => (
        <Box key={x} size={[0.9, 0.5, 0.9]} at={[x, 0.25, 2.8]} kind="cobre" />
      ))}
      {[2.6, 3.4].map((x) => (
        <Cyl key={x} r={0.32} h={0.8} at={[x, 0.4, 2.6]} kind="blindaje" />
      ))}
    </Board>
  );
}

function Bateria() {
  return (
    <Board y={-2.75} kind="pcbAzul">
      {[-1.05, 1.05].map((z) => (
        <group key={z} position={[0, 0.9, z]}>
          <Cyl r={0.9} h={6.3} at={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} kind="bateria" segments={32} />
          <Cyl r={0.86} h={0.15} at={[3.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} kind="bateriaTapa" segments={32} />
          <Cyl r={0.86} h={0.15} at={[-3.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} kind="bateriaTapa" segments={32} />
        </group>
      ))}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.3, 1.9, 4.2]} at={[s * 3.5, 0.95, 0]} kind="conector" />
      ))}
    </Board>
  );
}

function OBC() {
  return (
    <Board y={-0.35}>
      <Box size={[1.8, 0.1, 2.6]} at={[0, 0.05, 0.6]} kind="blindaje" />
      <Box size={[1.6, 0.22, 2.2]} at={[0, 0.16, 0.5]} kind="blindaje" />
      <Box size={[1.6, 0.04, 0.7]} at={[0, 0.06, 2.2]} kind="oro" />
      <Chip at={[2.6, 0.6]} size={[0.6, 0.12, 0.6]} />
      <Chip at={[-2.6, 1.6]} size={[1.2, 0.15, 0.8]} />
      {/* Flecha de referencia de la IMU (+Z) */}
      <Box size={[0.1, 0.02, 1]} at={[2.6, 0.13, 1.4]} kind="oro" />
      <Box size={[0.4, 0.02, 0.1]} at={[2.6, 0.13, 1.9]} kind="oro" rotation={[0, 0, 0]} />
    </Board>
  );
}

function Sensores() {
  return (
    <Board y={1.25}>
      <Box size={[2.5, 0.25, 2.5]} at={[1.8, 0.13, 1.4]} kind="cobre" />
      <Box size={[2.3, 0.08, 2.3]} at={[1.8, 0.29, 1.4]} kind="oro" />
      <Chip at={[-2, 1.6]} size={[0.5, 0.15, 0.5]} />
      <Cyl r={0.35} h={0.4} at={[-2.4, 0.2, 0]} kind="lente" />
      <Chip at={[-0.5, -1.5]} size={[1.2, 0.18, 0.8]} />
    </Board>
  );
}

function Comms() {
  return (
    <Board y={2.7} kind="pcbAzul">
      <Box size={[3.6, 0.45, 3]} at={[-1, 0.23, 0.6]} kind="blindaje" />
      <Cyl r={0.22} h={0.9} at={[3, 0.45, 2.8]} kind="oro" segments={12} />
      <Cyl r={0.12} h={1.6} at={[3, 1.4, 2.8]} kind="conector" segments={8} />
      <Chip at={[2.4, -1]} />
    </Board>
  );
}

function Camara() {
  return (
    <Board y={4.15}>
      <Box size={[2.6, 0.6, 2.6]} at={[0, 0.3, 0]} kind="anodizado" />
      <Cyl r={0.8} h={0.5} at={[0, 0.8, 0]} kind="anodizado" segments={32} />
      <Cyl r={0.55} h={0.06} at={[0, 1.07, 0]} kind="lente" segments={32} />
      <Chip at={[3, 2.5]} size={[0.8, 0.12, 0.8]} />
    </Board>
  );
}

function Antenas() {
  return (
    <group position={[0, 5.6, 0]}>
      {[-1, 1].map((s) => (
        <Box key={`x${s}`} size={[9.6, 0.28, 1.2]} at={[0, 0, s * 4.2]} kind="anodizado" />
      ))}
      {[-1, 1].map((s) => (
        <Box key={`z${s}`} size={[1.2, 0.28, 7.2]} at={[s * 4.2, 0, 0]} kind="anodizado" />
      ))}
      {/* Cintas desplegadas, una por lado */}
      <Box size={[0.04, 0.35, 15]} at={[4.82, 0, -7]} kind="cinta" />
      <Box size={[0.04, 0.35, 15]} at={[-4.82, 0, 7]} kind="cinta" />
      <Box size={[15, 0.35, 0.04]} at={[7, 0, 4.82]} kind="cinta" />
      <Box size={[15, 0.35, 0.04]} at={[-7, 0, -4.82]} kind="cinta" />
      {corners.map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.5, 0.2, 0.5]} at={[x * 3.4, 0.22, z * 3.4]} kind="oro" />
      ))}
    </group>
  );
}

/** Un panel lateral; la cara exterior apunta a +X local. */
function Panel() {
  return (
    <group>
      <Box size={[0.16, 10.6, 8.2]} at={[0, 0, 0]} kind="panel" />
      {[2.55, -2.55].map((y) => (
        <Box key={y} size={[0.04, 4.4, 7.4]} at={[0.1, y, 0]} kind="celda" />
      ))}
      <Box size={[0.06, 0.5, 0.5]} at={[0.1, 0, 3.2]} kind="chip" />
    </group>
  );
}

export const panelFaces: { rot: number; dir: V3 }[] = [
  { rot: 0, dir: [1, 0, 0] },
  { rot: Math.PI / 2, dir: [0, 0, -1] },
  { rot: Math.PI, dir: [-1, 0, 0] },
  { rot: -Math.PI / 2, dir: [0, 0, 1] },
];

export const partGeometry: Record<Exclude<PartId, "paneles"> | "panel", () => ReactNode> = {
  panel: Panel,
  estructura: Estructura,
  eps: EPS,
  bateria: Bateria,
  obc: OBC,
  sensores: Sensores,
  comms: Comms,
  camara: Camara,
  antenas: Antenas,
};
