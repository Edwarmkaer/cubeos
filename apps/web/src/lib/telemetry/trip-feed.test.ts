import assert from "node:assert/strict";
import { test } from "node:test";

import { createTripFeed } from "./trip-feed.ts";

test("el productor emite una línea de viaje con campos numéricos", () => {
  const lines: string[] = [];
  const feed = createTripFeed((line) => lines.push(line), { duplicateEvery: 0, noiseEvery: 0 });
  feed.tick();

  const payload = JSON.parse(lines[0]);
  assert.equal(payload.vehicle_id, 1);
  assert.equal(payload.seq, 1);
  assert.equal(typeof payload.lat, "number");
  assert.equal(typeof payload.lon, "number");
});

test("el productor inyecta un duplicado periódico", () => {
  const lines: string[] = [];
  const feed = createTripFeed((line) => lines.push(line), {
    duplicateEvery: 2,
    noiseEvery: 0,
  });

  feed.tick();
  feed.tick();

  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[1]).seq, 2);
  assert.equal(JSON.parse(lines[2]).seq, 2);
});

test("el productor inyecta una coordenada imposible", () => {
  const lines: string[] = [];
  const feed = createTripFeed((line) => lines.push(line), {
    duplicateEvery: 0,
    noiseEvery: 2,
  });

  feed.tick();
  feed.tick();

  assert.ok(lines.some((line) => JSON.parse(line).lat === 200));
});
