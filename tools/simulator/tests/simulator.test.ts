import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateReceivedEnvelopeV1 } from "@cubeos/contracts";
import { simulate } from "../src/index.ts";

test("seeded replay is reproducible, changes with seed, and obeys group cadence", () => {
  const options = { seed: 42, durationMs: 4000 };
  const packets = simulate(options);
  assert.deepEqual(packets, simulate(options));
  assert.notDeepEqual(packets, simulate({ ...options, seed: 43 }));
  assert.equal(packets.length, 20);
  assert.deepEqual(packets.filter(p => p.envelope.payload.m === "I").map(p => p.atMs), [0, 500, 1000, 1500, 2000, 2500, 3000, 3500]);
  for (const type of ["H", "E", "O"]) assert.deepEqual(packets.filter(p => p.envelope.payload.m === type).map(p => p.atMs), [0, 1000, 2000, 3000]);
  assert.equal(packets.some(p => p.envelope.payload.m === "G"), false);
  assert.equal(packets.every(p => p.envelope.payload.t === 0 && (p.envelope.payload.fl & 1) === 1), true);
  assert.equal(packets.every(p => validateReceivedEnvelopeV1(p.envelope)), true);
  assert.deepEqual(packets.map(p => p.envelope.payload.n), Array.from({ length: 20 }, (_, n) => n));
});

test("optional simulated GPS runs at 0.5 Hz without implying installed hardware", () => {
  const packets = simulate({ seed: 42, durationMs: 4000, gps: true });
  assert.deepEqual(packets.filter(p => p.envelope.payload.m === "G").map(p => p.atMs), [0, 2000]);
  assert.equal(packets.every(p => validateReceivedEnvelopeV1(p.envelope)), true);
});

test("duplicate scenario preserves exact payload and leaves subsequent sequence unchanged", () => {
  const normal = simulate({ seed: 42, durationMs: 4000 });
  const duplicate = simulate({ seed: 42, durationMs: 4000, scenario: "duplicate" });
  assert.equal(duplicate.length, 21);
  assert.deepEqual(duplicate[1].envelope, duplicate[0].envelope);
  assert.deepEqual(duplicate.slice(2), normal.slice(1));
});

test("out-of-order delays an older sample past a newer one without rewriting flight times", () => {
  const packets = simulate({ seed: 42, durationMs: 4000, scenario: "out-of-order" });
  const imu = packets.filter(p => p.envelope.payload.m === "I");
  assert.deepEqual(imu.slice(0, 3).map(p => p.envelope.payload.u), [0, 1000, 500]);
  assert.equal(packets.every((p, i) => i === 0 || p.atMs >= packets[i - 1].atMs), true);
  assert.equal(packets.length, 20);
});

test("reboot restarts sequence and uptime together after the configured halfway point", () => {
  const packets = simulate({ seed: 42, durationMs: 4000, scenario: "reboot" });
  const firstAfter = packets.find(p => p.atMs === 2000)!;
  assert.equal(firstAfter.envelope.payload.n, 0);
  assert.equal(firstAfter.envelope.payload.u, 0);
  assert.equal(firstAfter.envelope.payload.st, 0);
  assert.equal(packets.every(p => validateReceivedEnvelopeV1(p.envelope)), true);
});

test("failure scenario carries valid flags and explicitly rejects omitted required sensor fields", () => {
  const packets = simulate({ seed: 42, durationMs: 4000, scenario: "failures" });
  const valid = packets.filter(p => validateReceivedEnvelopeV1(p.envelope));
  const invalid = packets.filter(p => !validateReceivedEnvelopeV1(p.envelope));
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].envelope.payload.m, "E");
  assert.equal("t1" in invalid[0].envelope.payload, false);
  assert.equal(valid.some(p => (p.envelope.payload.fl & 2) !== 0), true);
});

test("CLI emits pure reproducible NDJSON envelopes or a scheduled JSON fixture", () => {
  const cli = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const args = [cli, "--seed", "42", "--duration-ms", "2000", "--gps"];
  const first = execFileSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(first, execFileSync(process.execPath, args, { encoding: "utf8" }));
  const packets = first.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(packets.length, 11);
  assert.equal(packets.every((p: unknown) => validateReceivedEnvelopeV1(p)), true);
  const fixture = JSON.parse(execFileSync(process.execPath, [...args, "--format", "fixture"], { encoding: "utf8" }));
  assert.equal(fixture[4].atMs, 0);
  assert.deepEqual(fixture.map((p: { envelope: unknown }) => p.envelope), packets);
});

test("CLI refuses unknown scenarios, nonfinite/oversized counts, unknown flags and invalid seeds", () => {
  const cli = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  for (const args of [["--scenario", "typo"], ["--duration-ms", "Infinity"], ["--duration-ms", "0"], ["--duration-ms", "999999999"], ["--seed", "-1"], ["--format", "csv"], ["--secret"], ["--gps", "false"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /simulator/i);
  }
});
