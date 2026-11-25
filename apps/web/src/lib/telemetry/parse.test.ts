import assert from "node:assert/strict";
import { test } from "node:test";

import { detectFormat, parseLine } from "./parse.ts";
import { demoProfile, emptyProfile, mergeKeys, parseProfile } from "./profile.ts";
import { readingsToCsv } from "./csv.ts";

test("json: aplana objetos anidados y descarta texto", () => {
  assert.deepEqual(parseLine('{"t":21.5,"imu":{"roll":3,"ok":true},"id":"x"}', "auto"), {
    kind: "values",
    values: { t: 21.5, "imu.roll": 3, "imu.ok": 1 },
  });
});

test("json inválido se omite", () => {
  assert.deepEqual(parseLine("{roto", "json"), { kind: "skip" });
});

test("clave=valor con distintos separadores", () => {
  assert.deepEqual(parseLine("temp=21.4, hum:40 rssi=-90", "auto"), {
    kind: "values",
    values: { temp: 21.4, hum: 40, rssi: -90 },
  });
});

test("csv: encabezado y luego valores con nombres", () => {
  assert.deepEqual(parseLine("temp;hum", "auto"), { kind: "header", columns: ["temp", "hum"] });
  assert.deepEqual(parseLine("21.0;40", "csv", ["temp", "hum"]), { kind: "values", values: { temp: 21, hum: 40 } });
  assert.deepEqual(parseLine("1,2,3", "csv"), { kind: "values", values: { c1: 1, c2: 2, c3: 3 } });
});

test("detecta formato", () => {
  assert.equal(detectFormat('{"a":1}'), "json");
  assert.equal(detectFormat("a=1"), "kv");
  assert.equal(detectFormat("1,2"), "csv");
});

test("mergeKeys adivina unidades y asigna orientación y GPS", () => {
  const p = mergeKeys(emptyProfile(), ["temp", "roll", "pitch", "yaw", "lat", "lon"]);
  assert.equal(p.fields[0].unit, "°C");
  assert.deepEqual(p.attitude, { roll: "roll", pitch: "pitch", yaw: "yaw" });
  assert.deepEqual(p.gps, { lat: "lat", lon: "lon" });
  assert.equal(mergeKeys(p, ["temp"]), p);
});

test("parseProfile valida y rechaza roles inexistentes", () => {
  const copy = parseProfile(JSON.parse(JSON.stringify(demoProfile)));
  assert.deepEqual(copy, demoProfile);
  assert.equal(parseProfile({ version: 2, fields: [] }), null);
  const bad = parseProfile({ version: 1, fields: [{ key: "a" }], gps: { lat: "a", lon: "z" } });
  assert.equal(bad?.gps, null);
});

test("csv de lecturas", () => {
  const csv = readingsToCsv([{ t: 0, values: { a: 1 } }, { t: 1000, values: { a: 2, b: 3 } }]);
  assert.equal(csv, "time,a,b\n1970-01-01T00:00:00.000Z,1,\n1970-01-01T00:00:01.000Z,2,3\n");
});
