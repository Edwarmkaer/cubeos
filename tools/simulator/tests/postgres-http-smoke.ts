import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";

const binary = process.env.CUBEOS_API_BINARY;
const database = process.env.TEST_TRANSPORT_DATABASE_URL;
assert.ok(binary && database, "disposable database and built API required");
const port = process.env.CUBEOS_TRANSPORT_TEST_PORT ?? "18085";
const base = `http://127.0.0.1:${port}`;
const ingress = `127.0.0.1:${Number(port) + 1}`;
const env = { ...process.env, DATABASE_URL: database, PORT: port, LISTEN_HOST: "127.0.0.1", DEPLOYMENT_MODE: "local", AUTH_MODE: "local", SERIAL_PORT: "", SERIAL_SOURCE_ID: "", SERIAL_BAUD: "", INGESTION_ADDRESS: ingress, LOCAL_CONTAINER: "false" };
execFileSync(binary, ["migrate"], { env, stdio: "pipe" });
const api = spawn(binary, [], { env, stdio: "ignore" });
const exit = once(api, "exit");
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
  // Actual CLI, actual TCP, actual Go server and PostgreSQL. No token in argv/logs.
  execFileSync(process.execPath, ["tools/simulator/src/index.ts", "--transport", "http", "--url", `http://${ingress}/api/v1/ingestion/packets`, "--seed", "42", "--duration-ms", "2000", "--rate", "100"], { env: { ...process.env, CUBEOS_SOURCE_CREDENTIAL: source.credential }, stdio: "pipe" });
  const snapshot = await request(`/api/v1/devices/${device.id}/snapshot`); assert.equal(snapshot.status, 200);
  const projection = await snapshot.json() as { snapshot: { sensors: { guvaS12sd: { uvIndex: unknown }; mpu6050: { angularRateDps: unknown } } }; revision: number };
  assert.equal(projection.revision, 10); assert.equal(projection.snapshot.sensors.guvaS12sd.uvIndex, null); assert.ok(projection.snapshot.sensors.mpu6050.angularRateDps);
  const history = await request(`/api/v1/devices/${device.id}/packets?limit=100`); assert.equal(history.status, 200);
  const page = await history.json() as { packets: { status: string }[] }; assert.equal(page.packets.length, 10); assert.ok(page.packets.every(packet => packet.status === "accepted"));
  const listed = await request(`/api/v1/devices/${device.id}/sources`); assert.equal(listed.status, 200); assert.ok(!JSON.stringify(await listed.json()).includes(source.credential));
  assert.equal((await request(`/api/v1/devices/${device.id}/sources/${source.id}`, "DELETE")).status, 204);
  assert.equal((await request("/api/v1/ingestion/packets", "POST", {}, source.credential)).status, 401);
  console.log("PASS: actual simulator CLI → HTTP → Go → PostgreSQL; source provisioning/revocation and projection/history");
} finally {
  api.kill("SIGTERM"); await exit;
}
