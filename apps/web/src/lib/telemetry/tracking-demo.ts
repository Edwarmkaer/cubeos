// DEMO de seguimiento: emite líneas como una placa con GPS.
// Incluye duplicados y una coordenada imposible para ejercitar el reductor.

import type { LineSource } from "./serial.ts";
import { DEFAULT_TRACKING_CONFIG, type TrackingConfig } from "./tracking.ts";

export type TrackingFeedOptions = {
  startSeq?: number;
  projectId?: number;
  duplicateEvery?: number;
  noiseEvery?: number;
  origin?: { lat: number; lon: number };
};

export type TrackingFeed = {
  tick: () => void;
  close: () => Promise<void>;
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export const TRACKING_FEED_OPTIONS: TrackingFeedOptions = {
  origin: { lat: -12.046, lon: -77.043 },
  duplicateEvery: 5,
  noiseEvery: 7,
};

export const TRACKING_CONFIG: TrackingConfig = {
  ...DEFAULT_TRACKING_CONFIG,
  zone: { lat: -12.046, lon: -77.043, radiusM: 300 },
};

export function createTrackingFeed(
  onLine: (line: string) => void,
  options: TrackingFeedOptions = {},
): TrackingFeed {
  const duplicateEvery = options.duplicateEvery ?? 5;
  const noiseEvery = options.noiseEvery ?? 7;
  const projectId = options.projectId ?? 1;
  const origin = options.origin ?? { lat: -12.046, lon: -77.043 };

  let seq = (options.startSeq ?? 1) - 1;
  let step = 0;
  let closed = false;

  function tick() {
    if (closed) return;
    step += 1;
    seq += 1;
    // Deriva lenta con un poco de ruido: termina saliendo de la zona de operación.
    const lat = round(origin.lat + step * 0.0002 + (step % 3) * 0.00002, 5);
    const lon = round(origin.lon + step * 0.00013 - (step % 2) * 0.00002, 5);
    const payload = {
      project_id: projectId,
      seq,
      ts: Date.now(),
      lat,
      lon,
      temp: round(22 + Math.sin(step / 3), 2),
    };
    onLine(JSON.stringify(payload));
    if (duplicateEvery > 0 && step % duplicateEvery === 0) onLine(JSON.stringify(payload));
    if (noiseEvery > 0 && step % noiseEvery === 0) onLine(JSON.stringify({ ...payload, lat: 200 }));
  }

  return {
    tick,
    close: async () => {
      closed = true;
    },
  };
}

export function openTrackingFeed(
  onLine: (line: string) => void,
  intervalMs = 500,
  options: TrackingFeedOptions = {},
): LineSource {
  const feed = createTrackingFeed(onLine, options);
  const timer = setInterval(feed.tick, intervalMs);
  feed.tick();
  return {
    close: async () => {
      clearInterval(timer);
      await feed.close();
    },
  };
}
