import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeUplinkV2, validateUplinkV2 } from "../src/index.ts";

const cases = JSON.parse(readFileSync(new URL("../fixtures/chasqui-v2/normalization-cases.json", import.meta.url), "utf8"));
for (const { name, payload, expected } of cases) {
  test(`shared Go/TypeScript conversion: ${name}`, () => {
    const before = JSON.stringify(payload);
    assert.equal(validateUplinkV2(payload), true, "fixture must exercise accepted schema input");
    assert.deepEqual(normalizeUplinkV2(payload), expected);
    assert.equal(JSON.stringify(payload), before);
  });
}
test("normalization refuses malformed payloads, including required sensor omissions", () => {
  assert.throws(() => normalizeUplinkV2({ v: 1 }), /uplink/i);
  const value = { ...cases[0].payload };
  delete value.t1;
  assert.throws(() => normalizeUplinkV2(value), /uplink/i);
});

test("each optional IMU axis and GPS field can appear alone as zero on H without filling absent values", () => {
  const h = { v: 2, id: "CS01", m: "H", n: 0, u: 0, t: 0, st: 1, fl: 1, cam: 0, sd: 0, dp: 0 };
  const baseline = normalizeUplinkV2(h);
  assert.deepEqual(baseline.sensors, {});
  const fields = [
    ["ax", "mpu6050", { accelerationG: { x: 0 } }],
    ["ay", "mpu6050", { accelerationG: { y: 0 } }],
    ["az", "mpu6050", { accelerationG: { z: 0 } }],
    ["gx", "mpu6050", { angularRateDps: { x: 0 } }],
    ["gy", "mpu6050", { angularRateDps: { y: 0 } }],
    ["gz", "mpu6050", { angularRateDps: { z: 0 } }],
    ["la", "gps", { latitudeDeg: 0 }],
    ["lo", "gps", { longitudeDeg: 0 }],
    ["al", "gps", { altitudeM: 0 }],
    ["sp", "gps", { speedMps: 0 }],
    ["hd", "gps", { headingDeg: 0 }],
    ["fx", "gps", { fix: 0 }],
    ["sa", "gps", { satellites: 0 }],
  ] as const;
  for (const [field, sensor, expected] of fields) {
    const payload = { ...h, [field]: 0 };
    assert.equal(validateUplinkV2(payload), true);
    assert.deepEqual(normalizeUplinkV2(payload).sensors, { [sensor]: expected }, field);
  }
});
