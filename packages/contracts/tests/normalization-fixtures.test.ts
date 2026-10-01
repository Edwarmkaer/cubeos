import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeUplinkV2 } from "../src/index.ts";

const cases = JSON.parse(readFileSync(new URL("../fixtures/chasqui-v2/normalization-cases.json", import.meta.url), "utf8"));
for (const { name, payload, expected } of cases) {
  test(`shared Go/TypeScript conversion: ${name}`, () => {
    const before = JSON.stringify(payload);
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
