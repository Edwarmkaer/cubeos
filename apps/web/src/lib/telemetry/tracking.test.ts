import assert from "node:assert/strict";
import { test } from "node:test";

import type { Reading } from "./store.ts";
import {
  DEFAULT_TRACKING_CONFIG,
  ingestTracking,
  initialTrackingState,
  type TrackingConfig,
} from "./tracking.ts";

const config: TrackingConfig = {
  ...DEFAULT_TRACKING_CONFIG,
  zone: { lat: -12.046, lon: -77.043, radiusM: 300 },
};

function reading(seq: number, lat = -12.046, lon = -77.043, projectId = 1): Reading {
  return {
    t: 1_700_000_000_000 + seq * 1000,
    values: { project_id: projectId, seq, lat, lon, temp: 22 },
  };
}

test("una lectura repetida no cambia el seguimiento", () => {
  let state = initialTrackingState(config);
  state = ingestTracking(state, reading(1), config);
  state = ingestTracking(state, reading(1), config);

  assert.equal(state.applied, 1);
  assert.equal(state.duplicateCount, 1);
  assert.deepEqual(state.position, { lat: -12.046, lon: -77.043 });
});

test("las lecturas fuera de orden se aplican cuando llega la faltante", () => {
  let state = initialTrackingState(config);
  state = ingestTracking(state, reading(3, -12.05, -77.05), config);
  assert.equal(state.applied, 0);
  assert.equal(state.pending.length, 1);

  state = ingestTracking(state, reading(1), config);
  state = ingestTracking(state, reading(2, -12.048, -77.046), config);

  assert.equal(state.applied, 3);
  assert.equal(state.lastSeq, 3);
  assert.deepEqual(state.position, { lat: -12.05, lon: -77.05 });
  assert.equal(state.lateCount, 0);
});

test("una posición dentro de la zona marca que está en zona", () => {
  let state = initialTrackingState(config);
  state = ingestTracking(state, reading(1), config);

  assert.equal(state.insideZone, true);
  assert.equal(state.status, "siguiendo");
  assert.ok(state.distanceToZoneM !== null && state.distanceToZoneM <= 300);
});

test("una posición lejos de la zona marca fuera de zona", () => {
  let state = initialTrackingState(config);
  state = ingestTracking(state, reading(1, -12.2, -77.2), config);

  assert.equal(state.insideZone, false);
  assert.equal(state.status, "fuera_de_zona");
});

test("varias lecturas sin movimiento marcan sin movimiento", () => {
  const noZone: TrackingConfig = { ...config, zone: null };
  let state = initialTrackingState(noZone);
  for (let seq = 1; seq <= 3; seq++) {
    state = ingestTracking(state, reading(seq), noZone);
  }

  assert.equal(state.status, "sin_movimiento");
  assert.equal(state.speedKmh, 0);
});

test("una coordenada imposible se cuenta como descarte", () => {
  const state = ingestTracking(initialTrackingState(config), reading(1, 200), config);

  assert.equal(state.discardedCount, 1);
  assert.equal(state.applied, 0);
  assert.equal(state.position, null);
});
