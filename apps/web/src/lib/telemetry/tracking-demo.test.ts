import assert from "node:assert/strict";
import { test } from "node:test";

import { createTrackingFeed } from "./tracking-demo.ts";

test("la DEMO emite una lectura de seguimiento con campos numéricos", () => {
  const lines: string[] = [];
  const feed = createTrackingFeed((line) => lines.push(line), {
    duplicateEvery: 0,
    noiseEvery: 0,
  });
  feed.tick();

  const payload = JSON.parse(lines[0]);
  assert.equal(payload.project_id, 1);
  assert.equal(payload.seq, 1);
  assert.equal(typeof payload.lat, "number");
  assert.equal(typeof payload.lon, "number");
  assert.equal(typeof payload.temp, "number");
});

test("la DEMO inyecta un duplicado periódico", () => {
  const lines: string[] = [];
  const feed = createTrackingFeed((line) => lines.push(line), {
    duplicateEvery: 2,
    noiseEvery: 0,
  });

  feed.tick();
  feed.tick();

  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[1]).seq, 2);
  assert.equal(JSON.parse(lines[2]).seq, 2);
});

test("la DEMO inyecta una coordenada imposible", () => {
  const lines: string[] = [];
  const feed = createTrackingFeed((line) => lines.push(line), {
    duplicateEvery: 0,
    noiseEvery: 2,
  });

  feed.tick();
  feed.tick();

  assert.ok(lines.some((line) => JSON.parse(line).lat === 200));
});
