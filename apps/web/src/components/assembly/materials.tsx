"use client";

import { createContext, useContext, useMemo } from "react";
import * as THREE from "three";

export type MaterialKind =
  | "aluminio"
  | "anodizado"
  | "pcb"
  | "pcbAzul"
  | "chip"
  | "oro"
  | "cobre"
  | "bateria"
  | "bateriaTapa"
  | "blindaje"
  | "panel"
  | "celda"
  | "lente"
  | "cinta"
  | "conector";

type Spec = { color: string; metalness: number; roughness: number; map?: "celda" };

const specs: Record<MaterialKind, Spec> = {
  aluminio: { color: "#c4c8d2", metalness: 0.85, roughness: 0.32 },
  anodizado: { color: "#2b2d36", metalness: 0.6, roughness: 0.45 },
  pcb: { color: "#173a2c", metalness: 0.1, roughness: 0.55 },
  pcbAzul: { color: "#182a4a", metalness: 0.1, roughness: 0.55 },
  chip: { color: "#16171c", metalness: 0.2, roughness: 0.6 },
  oro: { color: "#d9a650", metalness: 1, roughness: 0.25 },
  cobre: { color: "#b87333", metalness: 0.9, roughness: 0.35 },
  bateria: { color: "#2f5f9e", metalness: 0.3, roughness: 0.4 },
  bateriaTapa: { color: "#d0d3da", metalness: 0.9, roughness: 0.25 },
  blindaje: { color: "#aeb3bd", metalness: 0.9, roughness: 0.4 },
  panel: { color: "#1b1d24", metalness: 0.3, roughness: 0.6 },
  celda: { color: "#ffffff", metalness: 0.55, roughness: 0.22, map: "celda" },
  lente: { color: "#0b0d14", metalness: 0.9, roughness: 0.05 },
  cinta: { color: "#d6d8de", metalness: 0.95, roughness: 0.2 },
  conector: { color: "#111216", metalness: 0.1, roughness: 0.7 },
};

/** Textura de celda solar: fondo azul profundo con dedos colectores plateados. */
function cellTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 256, 128);
  g.addColorStop(0, "#1c2c66");
  g.addColorStop(1, "#121c48");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(200,206,220,0.55)";
  for (let x = 6; x < 256; x += 8) ctx.fillRect(x, 0, 1, 128);
  ctx.fillStyle = "rgba(220,224,235,0.9)";
  ctx.fillRect(0, 30, 256, 3);
  ctx.fillRect(0, 95, 256, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

type Look = "solid" | "ghost";
const LookContext = createContext<Look>("solid");
export const LookProvider = LookContext.Provider;

const ghost = new THREE.MeshBasicMaterial({
  color: "#7f9fb2",
  transparent: true,
  opacity: 0.035,
  depthWrite: false,
});

let cache: Partial<Record<MaterialKind, THREE.Material>> | null = null;
function material(kind: MaterialKind) {
  cache ??= {};
  const hit = cache[kind];
  if (hit) return hit;
  const spec = specs[kind];
  const made = new THREE.MeshStandardMaterial({
    color: spec.color,
    metalness: spec.metalness,
    roughness: spec.roughness,
    map: spec.map === "celda" ? cellTexture() : null,
  });
  cache[kind] = made;
  return made;
}

/** Devuelve el material compartido de un tipo, o el fantasma si la pieza aún no se monta. */
export function useMat(kind: MaterialKind) {
  const look = useContext(LookContext);
  return useMemo(() => (look === "ghost" ? ghost : material(kind)), [look, kind]);
}
