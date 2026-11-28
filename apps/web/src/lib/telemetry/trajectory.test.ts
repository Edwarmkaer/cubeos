import assert from "node:assert/strict";
import { test } from "node:test";

import type { Reading } from "./store.ts";
import {
  DEFAULT_TRAJECTORY_CONFIG,
  ingestTrajectory,
  initialTrajectoryState,
  trajectoryStats,
  trajectoryToCsv,
  trajectoryToGeoJson,
  type TrajectoryConfig,
} from "./trajectory.ts";

const config: TrajectoryConfig = DEFAULT_TRAJECTORY_CONFIG;

function reading(seq: number, lat: number, lon: number, t = 1_700_000_000_000 + seq * 1000): Reading {
  return { t, values: { project_id: 1, seq, lat, lon, temp: 22 } };
}

test("acumula puntos y distancia de dos lecturas consecutivas", () => {
  let state = initialTrajectoryState();
  state = ingestTrajectory(state, reading(1, -12.046, -77.043), config);
  state = ingestTrajectory(state, reading(2, -12.047, -77.043), config);

  assert.deepEqual(state.points.map((p) => p.seq), [1, 2]);
  assert.ok(state.distanceM > 100);
  assert.equal(state.startedAt, 1_700_000_000_000 + 1000);
});

test("una lectura repetida no agrega punto", () => {
  let state = initialTrajectoryState();
  state = ingestTrajectory(state, reading(1, -12.046, -77.043), config);
  state = ingestTrajectory(state, reading(1, -12.046, -77.043), config);

  assert.equal(state.points.length, 1);
  assert.equal(state.duplicateCount, 1);
});

test("las lecturas fuera de orden se guardan en orden de secuencia", () => {
  let state = initialTrajectoryState();
  state = ingestTrajectory(state, reading(2, -12.047, -77.043), config);
  assert.equal(state.points.length, 0);

  state = ingestTrajectory(state, reading(1, -12.046, -77.043), config);

  assert.deepEqual(state.points.map((p) => p.seq), [1, 2]);
  assert.equal(state.points.length, 2);
});

test("una coordenada imposible se descarta", () => {
  const state = ingestTrajectory(initialTrajectoryState(), reading(1, 200, -77.043), config);

  assert.equal(state.points.length, 0);
  assert.equal(state.discardedCount, 1);
});

test("las estadísticas reportan puntos, duración y velocidad media", () => {
  let state = initialTrajectoryState();
  state = ingestTrajectory(state, reading(1, -12.046, -77.043, 1000), config);
  state = ingestTrajectory(state, reading(2, -12.047, -77.043, 2000), config);

  const stats = trajectoryStats(state);
  assert.equal(stats.pointCount, 2);
  assert.equal(stats.durationMs, 1000);
  assert.ok(stats.avgSpeedKmh > 0);
});

test("exporta la trayectoria a CSV y GeoJSON", () => {
  let state = initialTrajectoryState();
  state = ingestTrajectory(state, reading(1, -12.046, -77.043), config);
  state = ingestTrajectory(state, reading(2, -12.047, -77.043), config);

  const csv = trajectoryToCsv(state.points);
  assert.match(csv, /^time,seq,project_id,lat,lon/);
  assert.equal(csv.trim().split("\n").length, 3);

  const geo = JSON.parse(trajectoryToGeoJson(state.points));
  assert.equal(geo.geometry.type, "LineString");
  assert.equal(geo.geometry.coordinates.length, 2);
  assert.equal(geo.geometry.coordinates[0][0], -77.043);
});
