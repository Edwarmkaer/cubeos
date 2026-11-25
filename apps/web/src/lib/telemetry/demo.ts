import type { LineSource } from "./serial.ts";

// Fuente sintética: emite líneas JSON como lo haría una placa por USB.
type State = { temperature: number; humidity: number; uv: number; roll: number; pitch: number; yaw: number; lat: number; lon: number; alt: number };

const walk = (v: number, step: number, min: number, max: number) => Math.min(max, Math.max(min, v + (Math.random() * 2 - 1) * step));
const round = (v: number, d: number) => Number(v.toFixed(d));

export function openDemo(onLine: (line: string) => void, intervalMs = 500): LineSource {
  let s: State = { temperature: 22, humidity: 45, uv: 5.5, roll: 12, pitch: -4, yaw: 248, lat: -12.046, lon: -77.043, alt: 408 };
  const timer = setInterval(() => {
    s = {
      temperature: walk(s.temperature, 0.3, -20, 60),
      humidity: walk(s.humidity, 0.5, 0, 100),
      uv: walk(s.uv, 0.1, 0, 11),
      roll: walk(s.roll, 0.8, -180, 180),
      pitch: walk(s.pitch, 0.5, -90, 90),
      yaw: (walk(s.yaw, 1.2, 0, 360) + 360) % 360,
      lat: walk(s.lat, 0.0008, -90, 90),
      lon: walk(s.lon, 0.0008, -180, 180),
      alt: walk(s.alt, 0.2, 380, 420),
    };
    const out = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, round(v, k === "lat" || k === "lon" ? 5 : 2)]));
    onLine(JSON.stringify(out));
  }, intervalMs);
  return { close: async () => clearInterval(timer) };
}
