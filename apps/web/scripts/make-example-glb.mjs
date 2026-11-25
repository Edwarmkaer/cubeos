// Genera public/examples/cubesat-basico.glb: un CubeSat 1U de cajas con nombres,
// para probar el armado cargable sin herramientas 3D. Uso: node scripts/make-example-glb.mjs
import { writeFileSync } from "node:fs";

// Cubo unitario centrado: 24 vértices (normales por cara) y 36 índices.
const faces = [
  [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
  [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
  [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
  [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]],
  [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
];
const pos = [], nor = [], idx = [];
faces.forEach(([n, quad], f) => {
  quad.forEach((v) => { pos.push(...v.map((c) => c / 2)); nor.push(...n); });
  const o = f * 4;
  idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
});
const bin = Buffer.concat([
  Buffer.from(new Float32Array(pos).buffer),
  Buffer.from(new Float32Array(nor).buffer),
  Buffer.from(new Uint16Array(idx).buffer),
]);

const materials = {
  aluminio: [0.72, 0.74, 0.78, 0.25, 0.45],
  pcb: [0.08, 0.36, 0.2, 0.1, 0.6],
  chip: [0.06, 0.06, 0.07, 0.2, 0.5],
  bateria: [0.15, 0.3, 0.75, 0.3, 0.4],
  panel: [0.08, 0.12, 0.4, 0.2, 0.3],
  cobre: [0.85, 0.55, 0.3, 0.3, 0.4],
};
const matNames = Object.keys(materials);

// [nombre, material, tamaño xyz, posición xyz] — unidades en cm.
const parts = [
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => [`Riel_${i + 1}`, "aluminio", [0.8, 11.35, 0.8], [4.6 * x, 0, 4.6 * z]]),
  ["Marco_Inferior", "aluminio", [10, 0.4, 10], [0, -5.3, 0]],
  ["EPS_Board", "pcb", [9, 0.16, 9], [0, -4.2, 0]],
  ["EPS_Conector", "chip", [6, 0.6, 0.8], [0, -3.85, 3.6]],
  ["Bateria_1", "bateria", [1.8, 1.8, 6.5], [-1.8, -2.9, 0]],
  ["Bateria_2", "bateria", [1.8, 1.8, 6.5], [1.8, -2.9, 0]],
  ["OBC_Board", "pcb", [9, 0.16, 9], [0, -1.2, 0]],
  ["OBC_Chip", "chip", [2, 0.3, 2], [0, -0.97, 0]],
  ["Sensores_Board", "pcb", [9, 0.16, 9], [0, 0.8, 0]],
  ["Sensores_GPS", "chip", [2.5, 0.5, 2.5], [-2, 1.13, -2]],
  ["Radio_Board", "pcb", [9, 0.16, 9], [0, 2.8, 0]],
  ["Radio_Blindaje", "cobre", [5, 0.8, 4], [0, 3.28, 0]],
  ["Marco_Superior", "aluminio", [10, 0.4, 10], [0, 5.3, 0]],
  ["Antena_Modulo", "aluminio", [9, 0.5, 9], [0, 5.75, 0]],
  ["Panel_XP", "panel", [0.2, 10, 9.2], [5.15, 0, 0]],
  ["Panel_XN", "panel", [0.2, 10, 9.2], [-5.15, 0, 0]],
  ["Panel_ZP", "panel", [9.2, 10, 0.2], [0, 0, 5.15]],
  ["Panel_ZN", "panel", [9.2, 10, 0.2], [0, 0, -5.15]],
];

const gltf = {
  asset: { version: "2.0", generator: "CubeOS make-example-glb" },
  scene: 0,
  scenes: [{ name: "CubeSat basico", nodes: parts.map((_, i) => i) }],
  nodes: parts.map(([name, mat, scale, translation]) => ({ name, mesh: matNames.indexOf(mat), scale, translation })),
  meshes: matNames.map((m, i) => ({ name: m, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }] })),
  materials: matNames.map((m) => {
    const [r, g, b, metal, rough] = materials[m];
    return { name: m, pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: metal, roughnessFactor: rough } };
  }),
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 288, target: 34962 },
    { buffer: 0, byteOffset: 288, byteLength: 288, target: 34962 },
    { buffer: 0, byteOffset: 576, byteLength: 72, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
  ],
};

const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const body = pad(bin, 0);
const chunk = (type, data) => Buffer.concat([Buffer.from(new Uint32Array([data.length, type]).buffer), data]);
const glb = Buffer.concat([chunk(0x4e4f534a, json), chunk(0x004e4942, body)]);
const header = Buffer.from(new Uint32Array([0x46546c67, 2, 12 + glb.length]).buffer);
writeFileSync(new URL("../public/examples/cubesat-basico.glb", import.meta.url), Buffer.concat([header, glb]));
console.log("cubesat-basico.glb", 12 + glb.length, "bytes,", parts.length, "piezas");
