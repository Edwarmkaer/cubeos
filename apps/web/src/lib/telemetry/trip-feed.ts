// Productor sintético de eventos de viaje: emite líneas JSON compatibles con parseLine.
// Escenarios incluidos a propósito: duplicados y coords imposibles para probar el pipeline.

import { DEFAULT_TRIP_CONFIG, type TripConfig } from "./trip-pipeline.ts";
import type { LineSource } from "./serial.ts";

export type TripFeedOptions = {
  startSeq?: number;
  duplicateEvery?: number;
  noiseEvery?: number;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
};

export type TripFeed = {
  tick: () => void;
  close: () => Promise<void>;
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export const TRIP_FEED_OPTIONS: TripFeedOptions = {
  origin: { lat: -12.046, lon: -77.043 },
  destination: { lat: -12.05, lon: -77.05 },
  duplicateEvery: 5,
  noiseEvery: 7,
};

export const TRIP_PIPELINE_CONFIG: TripConfig = {
  ...DEFAULT_TRIP_CONFIG,
  destination: TRIP_FEED_OPTIONS.destination!,
};

export function createTripFeed(
  onLine: (line: string) => void,
  options: TripFeedOptions = {},
): TripFeed {
  const duplicateEvery = options.duplicateEvery ?? 5;
  const noiseEvery = options.noiseEvery ?? 7;
  const origin = options.origin ?? { lat: -12.046, lon: -77.043 };
  const destination = options.destination ?? { lat: -12.05, lon: -77.05 };

  let seq = (options.startSeq ?? 1) - 1;
  let step = 0;
  let position = { ...origin };
  let closed = false;

  function emit(payload: Record<string, number>) {
    onLine(JSON.stringify(payload));
  }

  function tick() {
    if (closed) return;
    step += 1;
    seq += 1;
    position = {
      lat: position.lat + (destination.lat - position.lat) * 0.02,
      lon: position.lon + (destination.lon - position.lon) * 0.02,
    };
    const payload = {
      vehicle_id: 1,
      seq,
      ts: Date.now(),
      lat: round(position.lat, 5),
      lon: round(position.lon, 5),
      msg_code: step % 8 === 0 ? 2 : 0,
    };
    emit(payload);
    if (duplicateEvery > 0 && step % duplicateEvery === 0) emit({ ...payload });
    if (noiseEvery > 0 && step % noiseEvery === 0) emit({ ...payload, lat: 200 });
  }

  return {
    tick,
    close: async () => {
      closed = true;
    },
  };
}

export function openTripFeed(
  onLine: (line: string) => void,
  intervalMs = 500,
  options: TripFeedOptions = {},
): LineSource {
  const feed = createTripFeed(onLine, options);
  const timer = setInterval(feed.tick, intervalMs);
  feed.tick();
  return {
    close: async () => {
      clearInterval(timer);
      await feed.close();
    },
  };
}
