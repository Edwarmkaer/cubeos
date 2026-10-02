import type { SnapshotEvent } from "@cubeos/api-client";
import type { FieldFreshness } from "@cubeos/contracts";

export type ReadingState = "pending" | "unverified" | "current" | "stale" | "unknown_age" | "not_installed" | "unavailable";
export type Reading = { value: number | null; state: ReadingState; ageSeconds: number | null };
export type ReadingHistory = Record<string, { value: number; evidence: FieldFreshness }[]>;
export const chartFields = [
  "sensors.bme680.temperatureC", "sensors.bme680.relativeHumidityPct", "sensors.bme680.pressurePa",
  "sensors.bh1750.illuminanceLux", "sensors.guvaS12sd.adcRaw",
  ...["angularRateDps", "accelerationG"].flatMap(v => ["x", "y", "z"].map(a => `sensors.mpu6050.${v}.${a}`)),
] as const;

function valueAt(object: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => v !== null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, object);
}

export function fieldEvidence(event: SnapshotEvent, path: string): FieldFreshness | undefined {
  return Object.values(event.freshnessByGroup).map(g => g?.fields[path]).filter((v): v is FieldFreshness => v !== undefined)
    .sort((a, b) => b.receptionEpoch - a.receptionEpoch || Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.uptimeMs - a.uptimeMs)[0];
}

export function fieldAge(event: SnapshotEvent, path: string, now: number): Pick<Reading, "ageSeconds" | "state"> {
  const evidence = fieldEvidence(event, path);
  const ageSeconds = evidence ? Math.max(0, Math.floor((now - Date.parse(evidence.receivedAt)) / 1000)) : null;
  return { ageSeconds, state: ageSeconds === null ? "unknown_age" : ageSeconds > 10 ? "stale" : "current" };
}

export function reading(event: SnapshotEvent | null, path: string, now: number): Reading {
  if (!event) return { value: null, state: "pending", ageSeconds: null };
  const sensor = path.startsWith("sensors.") ? path.split(".").slice(0, 2).join(".") : path.split(".")[0];
  const status = valueAt(event.snapshot, `${sensor}.status`);
  const { ageSeconds, state } = fieldAge(event, path, now);
  if (status === "unverified") return { value: null, state: "unverified", ageSeconds };
  if (status === "unavailable" || status === "not_installed" || status === "monitor_not_installed") {
    return { value: null, state: status === "unavailable" ? "unavailable" : "not_installed", ageSeconds };
  }
  const value = valueAt(event.snapshot, path);
  if (typeof value !== "number" || !Number.isFinite(value)) return { value: null, state: "pending", ageSeconds };
  return { value, state, ageSeconds };
}

export function gpsPosition(event: SnapshotEvent | null) {
  const g = event?.snapshot.sensors.gps;
  if (!g || g.status !== "available" || (g.fix !== 2 && g.fix !== 3) || g.latitudeDeg === null || g.longitudeDeg === null ||
    !Number.isFinite(g.latitudeDeg) || !Number.isFinite(g.longitudeDeg) || Math.abs(g.latitudeDeg) > 90 || Math.abs(g.longitudeDeg) > 180) return null;
  return { gps_lat: g.latitudeDeg, gps_lon: g.longitudeDeg, gps_alt: g.altitudeM };
}

export function appendReadings(history: ReadingHistory, event: SnapshotEvent): ReadingHistory {
  const next = { ...history };
  for (const path of chartFields) {
    const r = reading(event, path, Date.now()); const e = fieldEvidence(event, path);
    if (r.value === null || !e) continue;
    const points = next[path] ?? []; const last = points.at(-1)?.evidence;
    if (last && (e.receptionEpoch < last.receptionEpoch || (e.receptionEpoch === last.receptionEpoch &&
      (Date.parse(e.receivedAt) < Date.parse(last.receivedAt) || (e.receivedAt === last.receivedAt && e.sequence === last.sequence && e.uptimeMs === last.uptimeMs))))) continue;
    next[path] = [...points, { value: r.value, evidence: e }].slice(-60);
  }
  return next;
}
