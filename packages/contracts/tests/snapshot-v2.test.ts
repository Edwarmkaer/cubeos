import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateSnapshotV2, validateReceivedEnvelopeV1 } from "../src/index.ts";

const snapshot = JSON.parse(readFileSync(new URL("../fixtures/chasqui-v2/backend-snapshot-example-v2.json", import.meta.url), "utf8"));
const packets = JSON.parse(readFileSync(new URL("../fixtures/chasqui-v2/uplink-examples-v2.json", import.meta.url), "utf8"));

test("delivered readable snapshot validates; missing data stays null and metadata stays separate", () => {
  assert.equal(validateSnapshotV2(snapshot), true);
  assert.equal(snapshot.sensors.gps.latitudeDeg, null);
  assert.equal(snapshot.power.batteryVoltageV, null);
  assert.equal(validateSnapshotV2({ ...snapshot, schemaVersion: "1.0" }), false);
  assert.equal(validateSnapshotV2({ ...snapshot, freshness: {} }), false);
  assert.equal(validateSnapshotV2({ ...snapshot, receivedAt: "yesterday" }), false);
  assert.equal(validateSnapshotV2({ ...snapshot, missionState: "UNKNOWN" }), false);
  assert.equal(validateSnapshotV2({ ...snapshot, lastSequence: -1 }), false);
});

test("snapshot rejects fabricated UV index, Euler, percentage and undeclared statuses", () => {
  for (const mutate of [
    (s: typeof snapshot) => { s.sensors.guvaS12sd.uvIndex = 5; },
    (s: typeof snapshot) => { s.sensors.mpu6050.euler = { roll: 1 }; },
    (s: typeof snapshot) => { s.power.batteryPercentage = 50; },
    (s: typeof snapshot) => { s.sensors.gps.status = "connected"; },
  ]) {
    const value = structuredClone(snapshot);
    mutate(value);
    assert.equal(validateSnapshotV2(value), false);
  }
  const measuredZero = structuredClone(snapshot);
  measuredZero.power = { status: "available", batteryVoltageV: 0, batteryCurrentA: 0, batteryPowerW: 0 };
  assert.equal(validateSnapshotV2(measuredZero), true);
});

test("envelope validates intact payload and optional receiver metadata without trusting client provenance", () => {
  const envelope = { envelopeVersion: 1, payload: packets[0], receiver: { gatewayId: "GS01", rssiDbm: -70, snrDb: 0 } };
  const before = JSON.stringify(envelope);
  assert.equal(validateReceivedEnvelopeV1(envelope), true);
  assert.equal(validateReceivedEnvelopeV1({ envelopeVersion: 1, payload: packets[0] }), true);
  assert.equal(JSON.stringify(envelope), before);
  for (const mutation of [{ receivedAt: "2026-09-25T00:00:00Z" }, { sourceId: "other" }, { envelopeVersion: 2 }, { receiver: { rssiDbm: "0" } }, { receiver: { secret: "x" } }, { payload: { ...packets[0], rssi: -70 } }]) {
    assert.equal(validateReceivedEnvelopeV1({ ...envelope, ...mutation }), false);
  }
});
