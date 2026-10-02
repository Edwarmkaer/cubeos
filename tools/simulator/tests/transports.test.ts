import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import { validateReceivedEnvelopeV1 } from "@cubeos/contracts";
import { deliver } from "../src/transports.ts";
import { simulate } from "../src/index.ts";

test("schema requires exact envelope and receiver keys, matching Go rejections", () => {
  const valid = simulate({ durationMs: 2000 })[0].envelope;
  assert.equal(validateReceivedEnvelopeV1(valid), true);
  const { payload, envelopeVersion, receiver } = valid;
  for (const invalid of [
    { envelopeVersion, Payload: payload, receiver },
    { EnvelopeVersion: envelopeVersion, payload, receiver },
    { envelopeVersion, payload, Receiver: receiver },
    { envelopeVersion, payload, receiver: { rssiDbm: -80, RSSIDbm: 0 } },
    { envelopeVersion, payload, receiver: { SNRDb: 4 } },
  ]) assert.equal(validateReceivedEnvelopeV1(invalid), false);
});

test("schema version const1 accepts equivalent numeric syntax without string coercion", () => {
  const raw = JSON.stringify(simulate({ durationMs: 2000 })[0].envelope);
  for (const version of ["1", "1.0", "1e0", "10e-1", "0.10e1"]) assert.equal(validateReceivedEnvelopeV1(JSON.parse(raw.replace('"envelopeVersion":1', `"envelopeVersion":${version}`))), true);
  for (const version of ['"1"', "true", "null", "2", "1.1", "0.9"]) assert.equal(validateReceivedEnvelopeV1(JSON.parse(raw.replace('"envelopeVersion":1', `"envelopeVersion":${version}`))), false);
});

test("serial delivery preserves seeded envelopes and honours backpressure", async () => {
  const lines: string[] = [];
  const writer = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) { lines.push(String(chunk)); setImmediate(callback); } });
  const packets = simulate({ seed: 42, durationMs: 2000 });
  await deliver(packets, { transport: "serial", writer, rate: 100, signal: new AbortController().signal });
  assert.deepEqual(lines.map(line => JSON.parse(line)), packets.map(packet => packet.envelope));
});

test("HTTP delivery sends source bearer in header", async () => {
  const received: string[] = [];
  const credential = randomBytes(32).toString("hex");
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${credential}`);
    assert.equal(req.url, "/api/v1/ingestion/packets");
    let body = ""; req.on("data", chunk => { body += chunk; }); req.on("end", () => { received.push(body); res.end("{}"); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const packets = simulate({ durationMs: 2000 });
    await deliver(packets, { transport: "http", url: `http://127.0.0.1:${address.port}/api/v1/ingestion/packets`, credential, rate: 100, signal: new AbortController().signal });
    assert.deepEqual(received.map(line => JSON.parse(line)), packets.map(packet => packet.envelope));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("delivery cancellation stops waiting without producing a frame", async () => {
  const controller = new AbortController(); controller.abort(); let written = false;
  const writer = new Writable({ write(_chunk, _encoding, callback) { written = true; callback(); } });
  await assert.rejects(deliver(simulate({ durationMs: 2000 }), { transport: "serial", writer, signal: controller.signal }));
  assert.equal(written, false);
});

test("HTTP redirects never forward the source credential", async () => {
  let redirected = false;
  const server = createServer((req, res) => {
    if (req.url === "/redirected") { redirected = true; res.end("{}"); }
    else { res.writeHead(307, { Location: "/redirected" }); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    await assert.rejects(deliver(simulate({ durationMs: 2000 }), { transport: "http", url: `http://127.0.0.1:${address.port}/api/v1/ingestion/packets`, credential: randomBytes(32).toString("hex"), signal: new AbortController().signal }));
    assert.equal(redirected, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
