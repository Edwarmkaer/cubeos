import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { simulate } from "../src/index.ts";
import { APIClient } from "../../../packages/api-client/src/client.ts";

const binary = process.env.CUBEOS_API_BINARY;
const database = process.env.TEST_TRANSPORT_DATABASE_URL;
assert.ok(binary && database, "disposable database and built API required");
const port = process.env.CUBEOS_TRANSPORT_TEST_PORT ?? "18085";
const base = `http://127.0.0.1:${port}`;
const ingress = `127.0.0.1:${Number(port) + 1}`;
const env = { ...process.env, DATABASE_URL: database, PORT: port, LISTEN_HOST: "127.0.0.1", DEPLOYMENT_MODE: "local", AUTH_MODE: "local", SERIAL_PORT: "", SERIAL_SOURCE_ID: "", SERIAL_BAUD: "", INGESTION_ADDRESS: ingress, LOCAL_CONTAINER: "false" };
execFileSync(binary, ["migrate"], { env, stdio: "pipe" });
let api = spawn(binary, [], { env, stdio: "ignore" });
let exit = once(api, "exit");
async function request(path: string, method = "GET", body?: unknown, credential?: string) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(credential && { Authorization: `Bearer ${credential}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await request("/readyz")).ok; } catch { /* startup */ }
    if (ready) break;
    if (api.exitCode !== null) throw new Error("API exited at startup");
    await delay(50);
  }
  assert.ok(ready, "real API readiness");
  const occupied = spawnSync(binary, [], { env: { ...env, PORT: String(Number(port) + 2) }, timeout: 5000, stdio: "ignore" });
  assert.equal(occupied.status, 1, "occupied ingestion port must fail startup");
  assert.equal((await fetch(`http://${ingress}/api/v1/devices`)).status, 404);
  assert.equal((await fetch(`http://${ingress}/healthz`)).status, 404);
  assert.equal((await fetch(`http://${ingress}/api/v1/ingestion/packets`, { method: "POST", headers: { Origin: "http://localhost:3000" } })).status, 403);
  const created = await request("/api/v1/devices", "POST", { name: "PR5 disposable transport check", protocolDeviceId: "CS01" });
  assert.equal(created.status, 201); const device = await created.json() as { id: string };
  const provisioned = await request(`/api/v1/devices/${device.id}/sources`, "POST", { transport: "http", gatewayId: "SIMULATOR" });
  assert.equal(provisioned.status, 201); const source = await provisioned.json() as { id: string; credential: string };
  const streamAbort = new AbortController();
  const revisions: bigint[] = [];
  let connected!: () => void;
  const connection = new Promise<void>(resolve => { connected = resolve; });
  // The URL alias remains valid and its exact event ID matches this consumer;
  // PostgreSQL NOTIFY uses the canonical lowercase UUID independently.
  const streaming = new APIClient(base).subscribeTelemetry(device.id.toUpperCase(), {
    getToken: () => null, signal: AbortSignal.any([streamAbort.signal, AbortSignal.timeout(15000)]),
    onConnection: state => { if (state === "connected") connected(); },
    onSnapshot: event => { revisions.push(BigInt(event.revisionId)); if (event.revisionId === "10") streamAbort.abort(); },
  });
  await Promise.race([connection, streaming.then(() => { throw new Error("stream ended before connect"); })]);
  // Actual CLI, actual TCP, actual Go server and PostgreSQL. No token in argv/logs.
  const cli = spawn(process.execPath, ["tools/simulator/src/index.ts", "--transport", "http", "--url", `http://${ingress}/api/v1/ingestion/packets`, "--seed", "42", "--duration-ms", "2000", "--rate", "100"], { env: { ...process.env, CUBEOS_SOURCE_CREDENTIAL: source.credential }, stdio: "ignore" });
  const [cliCode] = await once(cli, "exit"); assert.equal(cliCode, 0);
  await streaming;
  assert.ok(revisions.length > 0 && revisions.at(-1) === 10n, "typed SSE receives committed simulator state");
  assert.ok(revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]), "SSE monotonic and deduplicated");
  assert.equal((await request(`/api/v1/devices/${device.id}/events`, "GET", undefined, source.credential)).status, 401);
  assert.equal((await fetch(`http://${ingress}/api/v1/devices/${device.id}/events`)).status, 404);
  const snapshot = await request(`/api/v1/devices/${device.id}/snapshot`); assert.equal(snapshot.status, 200);
  const projection = await snapshot.json() as { snapshot: { sensors: { guvaS12sd: { uvIndex: unknown }; mpu6050: { angularRateDps: unknown } } }; revision: number };
  assert.equal(projection.revision, 10); assert.equal(projection.snapshot.sensors.guvaS12sd.uvIndex, null); assert.ok(projection.snapshot.sensors.mpu6050.angularRateDps);
  const history = await request(`/api/v1/devices/${device.id}/packets?limit=100`); assert.equal(history.status, 200);
  const page = await history.json() as { packets: { status: string }[] }; assert.equal(page.packets.length, 10); assert.ok(page.packets.every(packet => packet.status === "accepted"));
  const numericFrame = JSON.stringify(simulate({ seed: 42, durationMs: 2000 })[0].envelope).replace('"envelopeVersion":1', '"envelopeVersion":1.0');
  const numeric = await fetch(`http://${ingress}/api/v1/ingestion/packets`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${source.credential}` }, body: numericFrame });
  assert.equal(numeric.status, 200); assert.equal((await numeric.json() as { status: string }).status, "duplicated");
  const listed = await request(`/api/v1/devices/${device.id}/sources`); assert.equal(listed.status, 200); assert.ok(!JSON.stringify(await listed.json()).includes(source.credential));
  assert.equal((await request(`/api/v1/devices/${device.id}/sources/${source.id}`, "DELETE")).status, 204);
  assert.equal((await request("/api/v1/ingestion/packets", "POST", {}, source.credential)).status, 401);
  const open = await request(`/api/v1/devices/${device.id}/events`);
  assert.equal(open.status, 200);
  api.kill("SIGTERM"); await Promise.race([exit, delay(4000, undefined, { ref: false }).then(() => { throw new Error("graceful shutdown deadline"); })]);
  const closed = await open.text(); assert.match(closed, /event: snapshot/);
  api = spawn(binary, [], { env, stdio: "ignore" }); exit = once(api, "exit");
  for (let i = 0; i < 100; i++) {
    try { if ((await request("/readyz")).ok) break; } catch { /* startup */ }
    await delay(50);
  }
  const restored = await new APIClient(base).getSnapshot(device.id, null, AbortSignal.timeout(5000));
  assert.equal(restored.revisionId, "10");
  const reopened = await request(`/api/v1/devices/${device.id}/events`);
  assert.equal(reopened.status, 200); const reader = reopened.body!.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value); await reader.cancel();
  assert.ok(initial.includes(`id: ${device.id}:10\n`), "restart restores latest durable SSE state");
  console.log("PASS: actual simulator CLI → HTTP → Go → PostgreSQL → typed SSE; monotonic updates, source isolation/revocation, graceful shutdown and restart/latest state");
} finally {
  api.kill("SIGTERM"); await exit;
}
