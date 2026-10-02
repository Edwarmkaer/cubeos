import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { reading, gpsPosition, appendReadings, fieldEvidence, fieldAge } from "../src/lib/real-telemetry.ts";
import type { SnapshotEvent } from "@cubeos/api-client";

const snapshot = JSON.parse(readFileSync(new URL("../../../packages/contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json", import.meta.url), "utf8"));
const at = "2026-10-01T12:00:00Z";
const evidence = { receivedAt: at, sequence: 1, uptimeMs: 1, receptionEpoch: 0 };
const event = (): SnapshotEvent => ({ revision: 1, revisionId: "1", snapshot: structuredClone(snapshot), freshnessByGroup: { E: { ...evidence, fields: { "sensors.bme680.temperatureC": evidence } } } });

test("zero is a reading, unavailable and missing stay distinct, idle age becomes stale", () => {
  const e = event(); e.snapshot.sensors.bme680.temperatureC = 0;
  assert.deepEqual(reading(e, "sensors.bme680.temperatureC", Date.parse(at)), { value: 0, state: "current", ageSeconds: 0 });
  assert.equal(reading(e, "sensors.bme680.temperatureC", Date.parse(at) + 11000).state, "stale");
  e.snapshot.sensors.bme680.status = "unavailable";
  assert.equal(reading(e, "sensors.bme680.temperatureC", Date.parse(at)).state, "unavailable");
  e.snapshot.sensors.tmp102.status = "not_installed";
  assert.equal(reading(e, "sensors.tmp102.temperatureC", Date.parse(at)).state, "not_installed");
  assert.equal(reading(null, "sensors.bme680.temperatureC", Date.parse(at)).value, null);
});

test("GPS accepts zero with 2D/3D quality only, never fx1, missing or fault", () => {
  const e = event(); const g = e.snapshot.sensors.gps;
  assert.equal(gpsPosition(e), null);
  Object.assign(g, { status: "available", latitudeDeg: 0, longitudeDeg: 0, altitudeM: 12.34, fix: 2 });
  assert.deepEqual(gpsPosition(e), { gps_lat: 0, gps_lon: 0, gps_alt: 12.34 });
  g.fix = 1; assert.equal(gpsPosition(e), null);
  g.fix = 0; assert.equal(gpsPosition(e), null);
  g.fix = 3; g.status = "unavailable"; assert.equal(gpsPosition(e), null);
});

test("field evidence can arrive in any group; latest receipt wins independently", () => {
  const e = event(); const later = { ...evidence, receivedAt: "2026-10-01T12:00:05Z", sequence: 2 };
  e.freshnessByGroup.H = { ...later, fields: { "sensors.bme680.temperatureC": later } };
  assert.equal(fieldEvidence(e, "sensors.bme680.temperatureC")?.receivedAt, later.receivedAt);
  assert.equal(reading(e, "sensors.bme680.temperatureC", Date.parse(at) + 6000).ageSeconds, 1);
});

test("history only appends valid newly evidenced fields and bounds each series", () => {
  const e = event(); let h = appendReadings({}, e);
  assert.deepEqual(h["sensors.bme680.temperatureC"].map(p => p.value), [24.65]);
  assert.deepEqual(appendReadings(h, { ...e, revisionId: "2" }), h);
  for (let n = 2; n <= 80; n++) { const next = event(); next.snapshot.sensors.bme680.temperatureC = n; next.freshnessByGroup.E!.fields["sensors.bme680.temperatureC"] = { ...evidence, sequence: n, receivedAt: new Date(Date.parse(at) + n * 1000).toISOString() }; h = appendReadings(h, next); }
  assert.equal(h["sensors.bme680.temperatureC"].length, 60);
  e.snapshot.sensors.bme680.status = "unavailable";
  assert.deepEqual(appendReadings(h, e), h);
});

test("UV remains raw and battery is voltage only; pending fields are not zeros", () => {
  const e = event();
  assert.equal(reading(e, "sensors.guvaS12sd.adcRaw", Date.parse(at)).value, 1830);
  assert.equal(reading(e, "sensors.guvaS12sd.uvIndex", Date.parse(at)).value, null);
  assert.equal(reading(e, "power.batteryVoltageV", Date.parse(at)).value, null);
  assert.equal(e.snapshot.health.flags, 1);
});

test("boolean payload freshness ages independently of newer environment data", () => {
  const e = event();
  e.freshnessByGroup.H = { ...evidence, fields: { "payload.cameraOk": evidence } };
  assert.deepEqual(fieldAge(e, "payload.cameraOk", Date.parse(at) + 12000), { ageSeconds: 12, state: "stale" });
  assert.deepEqual(fieldAge(e, "payload.sdFreeMb", Date.parse(at)), { ageSeconds: null, state: "unknown_age" });
});
