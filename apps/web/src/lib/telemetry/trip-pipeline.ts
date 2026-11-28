import type { Reading } from "./store.ts";

export type TripStatus = "sin_datos" | "en_ruta" | "parado" | "en_destino";
export type TripSource = "gps" | "mensaje" | "inferido";

export type TripConfig = {
  vehicleField: string;
  seqField: string;
  latField: string;
  lonField: string;
  messageField: string;
  destination: { lat: number; lon: number };
  geofenceRadiusM: number;
  stopSpeedKmh: number;
  stopReadings: number;
};

export const DEFAULT_TRIP_CONFIG: TripConfig = {
  vehicleField: "vehicle_id",
  seqField: "seq",
  latField: "lat",
  lonField: "lon",
  messageField: "msg_code",
  destination: { lat: -12.06, lon: -77.06 },
  geofenceRadiusM: 300,
  stopSpeedKmh: 2,
  stopReadings: 3,
};

export type TripState = {
  status: TripStatus;
  source: TripSource;
  confidence: number;
  position: { lat: number; lon: number } | null;
  lastSeq: number;
  applied: number;
  duplicateCount: number;
  lateCount: number;
  discardedCount: number;
  distanceToDestinationM: number | null;
  speedKmh: number | null;
  etaMinutes: number | null;
  pending: Array<{ seq: number; reading: Reading }>;
  stoppedReadings: number;
  lastEventAt: number | null;
  seen: Set<string>;
};

export function initialTripState(config: TripConfig = DEFAULT_TRIP_CONFIG): TripState {
  void config;
  return {
    status: "sin_datos",
    source: "gps",
    confidence: 0,
    position: null,
    lastSeq: 0,
    applied: 0,
    duplicateCount: 0,
    lateCount: 0,
    discardedCount: 0,
    distanceToDestinationM: null,
    speedKmh: null,
    etaMinutes: null,
    pending: [],
    stoppedReadings: 0,
    lastEventAt: null,
    seen: new Set<string>(),
  };
}

export function ingestTrip(
  state: TripState,
  reading: Reading,
  config: TripConfig = DEFAULT_TRIP_CONFIG,
): TripState {
  const vehicle = reading.values[config.vehicleField];
  const seq = reading.values[config.seqField];
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];

  const invalid =
    !Number.isFinite(vehicle) ||
    !Number.isInteger(seq) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180;
  if (invalid) return { ...state, discardedCount: state.discardedCount + 1 };

  const key = `${vehicle}:${seq}`;
  if (state.seen.has(key)) {
    return { ...state, duplicateCount: state.duplicateCount + 1 };
  }

  const seen = new Set(state.seen);
  seen.add(key);
  let next: TripState = { ...state, seen };

  if (seq <= next.lastSeq) {
    return { ...next, lateCount: next.lateCount + 1 };
  }
  if (seq > next.lastSeq + 1) {
    const pending = [...next.pending, { seq, reading }].sort((a, b) => a.seq - b.seq);
    return { ...next, pending };
  }

  next = applyEvent(next, reading, config);
  while (next.pending.length > 0 && next.pending[0].seq === next.lastSeq + 1) {
    const [ready, ...rest] = next.pending;
    next = applyEvent({ ...next, pending: rest }, ready.reading, config);
  }
  return next;
}

function applyEvent(state: TripState, reading: Reading, config: TripConfig): TripState {
  const lat = reading.values[config.latField];
  const lon = reading.values[config.lonField];
  const seq = reading.values[config.seqField];
  const position = { lat, lon };

  const distanceM = haversineM(position, config.destination);
  const previous = state.position;
  const elapsedS = state.lastEventAt === null ? 0 : Math.max(0, (reading.t - state.lastEventAt) / 1000);
  let speedKmh: number | null = null;
  if (previous && elapsedS > 0) {
    const movedM = haversineM(previous, position);
    const raw = movedM / 1000 / (elapsedS / 3600);
    // Un salto de GPS no es movimiento real: se descarta como ruido.
    if (raw <= 200) speedKmh = raw;
  }

  const stopped = speedKmh === null || speedKmh <= config.stopSpeedKmh;
  const stoppedReadings = stopped ? state.stoppedReadings + 1 : 0;
  const arrived = distanceM <= config.geofenceRadiusM;
  const code = reading.values[config.messageField];
  const messageStatus: TripStatus | null =
    code === 1 ? "en_ruta" : code === 2 ? "parado" : code === 3 ? "en_destino" : null;
  const status: TripStatus =
    messageStatus ??
    (arrived
      ? "en_destino"
      : stoppedReadings >= config.stopReadings
        ? "parado"
        : "en_ruta");
  const source: TripSource = messageStatus ? "mensaje" : "gps";
  const confidence = messageStatus ? 0.6 : 1;
  const etaMinutes =
    status === "en_destino"
      ? 0
      : speedKmh && speedKmh > 0
        ? (distanceM / 1000 / speedKmh) * 60
        : state.etaMinutes;

  return {
    ...state,
    position,
    lastSeq: seq,
    lastEventAt: reading.t,
    applied: state.applied + 1,
    status,
    source,
    confidence,
    distanceToDestinationM: distanceM,
    speedKmh,
    etaMinutes,
    stoppedReadings,
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
