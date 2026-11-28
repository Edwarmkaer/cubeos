// Acumulador de trayectoria: convierte lecturas en una lista ordenada de puntos.
// Vive en memoria; la persistencia y el alcance los decide la superficie.

import type { Reading } from "./store.ts";
import { haversineM } from "./tracking.ts";

export type TrajectoryConfig = {
  projectField: string;
  seqField: string;
  latField: string;
  lonField: string;
};

export const DEFAULT_TRAJECTORY_CONFIG: TrajectoryConfig = {
  projectField: "project_id",
  seqField: "seq",
  latField: "lat",
  lonField: "lon",
};

export type TrajectoryPoint = {
  t: number;
  seq: number;
  projectId: number;
  lat: number;
  lon: number;
  temp: number | null;
};

export type TrajectoryState = {
  points: TrajectoryPoint[];
  pending: Array<{ seq: number; reading: Reading }>;
  seen: Set<string>;
  lastSeq: number;
  distanceM: number;
  startedAt: number | null;
  endedAt: number | null;
  duplicateCount: number;
  discardedCount: number;
};

export function initialTrajectoryState(): TrajectoryState {
  return {
    points: [],
    pending: [],
    seen: new Set<string>(),
    lastSeq: 0,
    distanceM: 0,
    startedAt: null,
    endedAt: null,
    duplicateCount: 0,
    discardedCount: 0,
  };
}

export function ingestTrajectory(
  state: TrajectoryState,
  reading: Reading,
  config: TrajectoryConfig = DEFAULT_TRAJECTORY_CONFIG,
): TrajectoryState {
  const project = reading.values[config.projectField] ?? 0;
  const rawSeq = reading.values[config.seqField];
  const seq = Number.isInteger(rawSeq) ? rawSeq : state.lastSeq + 1;
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ...state, discardedCount: state.discardedCount + 1 };
  }

  const key = `${project}:${seq}`;
  if (state.seen.has(key)) {
    return { ...state, duplicateCount: state.duplicateCount + 1 };
  }

  const seen = new Set(state.seen);
  seen.add(key);
  let next: TrajectoryState = { ...state, seen };

  if (seq <= next.lastSeq) return next;
  if (seq > next.lastSeq + 1) {
    next.pending = [...next.pending, { seq, reading }].sort((a, b) => a.seq - b.seq);
    return next;
  }

  next = appendPoint(next, reading, project, seq, config);
  while (next.pending.length > 0 && next.pending[0].seq === next.lastSeq + 1) {
    const [ready, ...rest] = next.pending;
    const readySeq = ready.reading.values[config.seqField] ?? ready.seq;
    next = appendPoint({ ...next, pending: rest }, ready.reading, project, readySeq, config);
  }
  return next;
}

function appendPoint(
  state: TrajectoryState,
  reading: Reading,
  project: number,
  seq: number,
  config: TrajectoryConfig,
): TrajectoryState {
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];
  const previous = state.points.at(-1);
  const stepM = previous ? haversineM(previous, { lat, lon }) : 0;
  const point: TrajectoryPoint = {
    t: reading.t,
    seq,
    projectId: project,
    lat,
    lon,
    temp: reading.values.temp ?? null,
  };
  return {
    ...state,
    points: [...state.points, point],
    lastSeq: seq,
    distanceM: state.distanceM + stepM,
    startedAt: state.startedAt ?? reading.t,
    endedAt: reading.t,
  };
}

export function trajectoryStats(state: TrajectoryState) {
  const pointCount = state.points.length;
  const durationMs = state.startedAt === null || state.endedAt === null ? 0 : state.endedAt - state.startedAt;
  return {
    pointCount,
    durationMs,
    distanceM: state.distanceM,
    avgSpeedKmh: durationMs > 0 ? state.distanceM / 1000 / (durationMs / 3_600_000) : 0,
  };
}

export function trajectoryToCsv(points: TrajectoryPoint[]): string {
  const head = "time,seq,project_id,lat,lon,temp";
  const rows = points.map((p) =>
    [new Date(p.t).toISOString(), p.seq, p.projectId, p.lat, p.lon, p.temp ?? ""].join(","),
  );
  return [head, ...rows].join("\n") + "\n";
}

export function trajectoryToGeoJson(points: TrajectoryPoint[]): string {
  return JSON.stringify({
    type: "Feature",
    properties: { points: points.length },
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lon, p.lat]),
    },
  });
}
