// Reductor puro de seguimiento: convierte lecturas en el estado de una placa.
// No depende de React ni de la fuente: sirve igual para DEMO que para serial.

import type { Reading } from "./store.ts";

export type TrackingStatus = "sin_datos" | "siguiendo" | "sin_movimiento" | "fuera_de_zona";

export type TrackingZone = { lat: number; lon: number; radiusM: number };

export type TrackingConfig = {
  projectField: string;
  seqField: string;
  latField: string;
  lonField: string;
  zone: TrackingZone | null;
  stillSpeedKmh: number;
  stillReadings: number;
};

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  projectField: "project_id",
  seqField: "seq",
  latField: "lat",
  lonField: "lon",
  zone: null,
  stillSpeedKmh: 2,
  stillReadings: 3,
};

export type TrackingState = {
  status: TrackingStatus;
  projectId: number | null;
  insideZone: boolean | null;
  position: { lat: number; lon: number } | null;
  distanceToZoneM: number | null;
  speedKmh: number | null;
  lastSeq: number;
  applied: number;
  duplicateCount: number;
  lateCount: number;
  discardedCount: number;
  pending: Array<{ seq: number; reading: Reading }>;
  stillReadings: number;
  lastEventAt: number | null;
  seen: Set<string>;
};

export function initialTrackingState(
  config: TrackingConfig = DEFAULT_TRACKING_CONFIG,
): TrackingState {
  void config;
  return {
    status: "sin_datos",
    projectId: null,
    insideZone: null,
    position: null,
    distanceToZoneM: null,
    speedKmh: null,
    lastSeq: 0,
    applied: 0,
    duplicateCount: 0,
    lateCount: 0,
    discardedCount: 0,
    pending: [],
    stillReadings: 0,
    lastEventAt: null,
    seen: new Set<string>(),
  };
}

export function ingestTracking(
  state: TrackingState,
  reading: Reading,
  config: TrackingConfig = DEFAULT_TRACKING_CONFIG,
): TrackingState {
  const project = reading.values[config.projectField];
  const seq = reading.values[config.seqField];
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];

  const invalid =
    !Number.isFinite(project) ||
    !Number.isInteger(seq) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180;
  if (invalid) return { ...state, discardedCount: state.discardedCount + 1 };

  const key = `${project}:${seq}`;
  if (state.seen.has(key)) {
    return { ...state, duplicateCount: state.duplicateCount + 1 };
  }

  const seen = new Set(state.seen);
  seen.add(key);
  let next: TrackingState = { ...state, seen };

  if (seq <= next.lastSeq) {
    return { ...next, lateCount: next.lateCount + 1 };
  }
  if (seq > next.lastSeq + 1) {
    const pending = [...next.pending, { seq, reading }].sort((a, b) => a.seq - b.seq);
    return { ...next, pending };
  }

  next = applyReading(next, reading, project, config);
  while (next.pending.length > 0 && next.pending[0].seq === next.lastSeq + 1) {
    const [ready, ...rest] = next.pending;
    next = applyReading({ ...next, pending: rest }, ready.reading, project, config);
  }
  return next;
}

function applyReading(
  state: TrackingState,
  reading: Reading,
  project: number,
  config: TrackingConfig,
): TrackingState {
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];
  const seq = reading.values[config.seqField];
  const position = { lat, lon };

  const distanceM = config.zone ? haversineM(position, config.zone) : null;
  const insideZone = distanceM === null ? null : distanceM <= config.zone!.radiusM;

  const previous = state.position;
  const elapsedS = state.lastEventAt === null ? 0 : Math.max(0, (reading.t - state.lastEventAt) / 1000);
  let speedKmh: number | null = null;
  if (previous && elapsedS > 0) {
    const raw = haversineM(previous, position) / 1000 / (elapsedS / 3600);
    // Un salto grande es ruido del GPS, no desplazamiento real.
    if (raw <= 200) speedKmh = raw;
  }

  const still = speedKmh === null || speedKmh <= config.stillSpeedKmh;
  const stillReadings = still ? state.stillReadings + 1 : 0;
  const status: TrackingStatus =
    insideZone === false
      ? "fuera_de_zona"
      : stillReadings >= config.stillReadings
        ? "sin_movimiento"
        : "siguiendo";

  return {
    ...state,
    status,
    projectId: project,
    insideZone,
    position,
    distanceToZoneM: distanceM,
    speedKmh,
    stillReadings,
    lastSeq: seq,
    lastEventAt: reading.t,
    applied: state.applied + 1,
  };
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
