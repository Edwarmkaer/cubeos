import assert from "node:assert/strict";
import { test } from "node:test";

import type { Reading } from "./store.ts";
import {
  DEFAULT_TRIP_CONFIG,
  ingestTrip,
  initialTripState,
  type TripConfig,
} from "./trip-pipeline.ts";

const config: TripConfig = {
  ...DEFAULT_TRIP_CONFIG,
  destination: { lat: -12.06, lon: -77.06 },
};

function reading(seq: number, lat = -12.046, lon = -77.043): Reading {
  return {
    t: 1_700_000_000_000 + seq * 1000,
    values: { vehicle_id: 1, seq, lat, lon, msg_code: 0 },
  };
}

test("un evento repetido no cambia el estado del viaje", () => {
  let state = initialTripState(config);
  state = ingestTrip(state, reading(1), config);
  state = ingestTrip(state, reading(1), config);

  assert.equal(state.applied, 1);
  assert.equal(state.duplicateCount, 1);
  assert.deepEqual(state.position, { lat: -12.046, lon: -77.043 });
});

test("los eventos fuera de orden se aplican en orden al llegar el faltante", () => {
  let state = initialTripState(config);
  state = ingestTrip(state, reading(3, -12.05, -77.05), config);
  assert.equal(state.applied, 0);
  assert.equal(state.pending.length, 1);

  state = ingestTrip(state, reading(1), config);
  state = ingestTrip(state, reading(2, -12.048, -77.046), config);

  assert.equal(state.applied, 3);
  assert.equal(state.lastSeq, 3);
  assert.deepEqual(state.position, { lat: -12.05, lon: -77.05 });
  assert.equal(state.lateCount, 0);
});

test("una posición dentro del geofence marca en_destino", () => {
  const near: TripConfig = {
    ...config,
    destination: { lat: -12.046, lon: -77.043 },
    geofenceRadiusM: 50,
  };
  let state = initialTripState(near);
  state = ingestTrip(state, reading(1), near);

  assert.equal(state.status, "en_destino");
  assert.equal(state.source, "gps");
  assert.ok(state.distanceToDestinationM !== null);
  assert.ok(state.distanceToDestinationM <= 50);
});

test("varias lecturas sin movimiento marcan parado", () => {
  const far: TripConfig = {
    ...config,
    destination: { lat: -12.2, lon: -77.2 },
  };
  let state = initialTripState(far);
  for (let seq = 1; seq <= 3; seq++) {
    state = ingestTrip(state, reading(seq, -12.046, -77.043), far);
  }

  assert.equal(state.status, "parado");
  assert.equal(state.speedKmh, 0);
});

test("un mensaje del operador redefine el estado y su procedencia", () => {
  const far: TripConfig = {
    ...config,
    destination: { lat: -12.2, lon: -77.2 },
  };
  let state = initialTripState(far);
  state = ingestTrip(state, reading(1), far);

  const message = reading(2);
  message.values[config.messageField] = 2;
  state = ingestTrip(state, message, far);

  assert.equal(state.status, "parado");
  assert.equal(state.source, "mensaje");
  assert.equal(state.confidence, 0.6);
});

test("una coordenada imposible va a la cola de descartes", () => {
  const bad = reading(1, 200, -77.043);
  const state = ingestTrip(initialTripState(config), bad, config);

  assert.equal(state.discardedCount, 1);
  assert.equal(state.applied, 0);
  assert.deepEqual(state.position, null);
});
