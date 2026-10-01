import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { validateUplinkV2 } from "../src/index.ts";

const examples = JSON.parse(readFileSync(new URL("../fixtures/chasqui-v2/uplink-examples-v2.json", import.meta.url), "utf8"));

test("all five delivered message types validate without changing payloads", () => {
  const before = JSON.stringify(examples);
  assert.deepEqual(examples.map((p: unknown) => validateUplinkV2(p)), [true, true, true, true, true]);
  assert.equal(JSON.stringify(examples), before);
});

test("v1, unknown keys, wrong types, ranges and missing type requirements are rejected", () => {
  const mutations = [{ v: 1 }, { rssi: -50 }, { bt: 2100 }, { v: "2" }, { n: -1 }, { n: 4294967296 }, { st: 7 }, { fl: 256 }, { cam: true }];
  for (const mutation of mutations) assert.equal(validateUplinkV2({ ...examples[0], ...mutation }), false);
  for (const [i, field] of ["cam", "t1", "uvr", "gz", "la"].entries()) {
    const packet = { ...examples[i] };
    delete packet[field];
    assert.equal(validateUplinkV2(packet), false, `missing ${field}`);
  }
  for (const value of [null, [], "packet", {}, { ...examples[0], m: "X" }]) assert.equal(validateUplinkV2(value), false);
});

test("missing optional energy and measured zero remain distinct; fx=1 follows schema", () => {
  const absent = structuredClone(examples[0]);
  const zero = { ...absent, bv: 0, bi: 0, bp: 0 };
  assert.equal(validateUplinkV2(absent), true);
  assert.equal(validateUplinkV2(zero), true);
  assert.equal("bv" in absent, false);
  assert.equal(zero.bv, 0);
  assert.equal(validateUplinkV2({ ...examples[4], fx: 1 }), true);
  assert.equal(validateUplinkV2({ ...examples[3], gx: 0, gy: 0, gz: 0, ax: 0, ay: 0, az: 0 }), true);
});

test("original JSON assets retain the delivery SHA-256 bytes", () => {
  const assets = {
    "../schemas/uplink-v2.json": "3548bb695d5ab9cd9aaabf50903379ccf2c8807dd6de60ec050109ce2df6fdfd",
    "../fixtures/chasqui-v2/uplink-examples-v2.json": "41bd786a97099c61a7f7bedf1197175368241cccd715f9aa61d06cfe698caf70",
    "../fixtures/chasqui-v2/backend-snapshot-example-v2.json": "2652ab55dfd369278eb566dcca33c99a17dea68e5369cb520f92f6630da55710",
  };
  for (const [path, checksum] of Object.entries(assets)) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex"), checksum);
  }
});
