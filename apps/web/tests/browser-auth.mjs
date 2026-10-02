import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input); input = "";
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, entryPoints: ["tests/auth-browser-fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "next/image": fileURLToPath(new URL("./media-test-image.tsx", import.meta.url)) } });
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
  else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Isolated signed auth fixture</title><div id="root"></div><script src="/fixture.js"></script></html>'); }
});
server.listen(3118, "127.0.0.1"); await once(server, "listening");
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(f => { window.fixture = f; }, fixture);
  const errors = []; const remote = [];
  await context.route("**/*", route => { const u = new URL(route.request().url()); if (!["localhost", "127.0.0.1"].includes(u.hostname)) { remote.push(u.hostname); return route.abort(); } return route.continue(); });
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(fixture.origin, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Origen", { exact: true }).waitFor();
  const get = label => page.getByLabel(label, { exact: true });
  const list = () => page.getByRole("button", { name: "Consultar dispositivos" }).click();
  const switchTo = async account => { const generation = (await page.evaluate(() => window.view())).generation; await page.evaluate(a => window.account(a), account); await page.waitForFunction(g => window.view().generation > g, generation); };
  const empty = async () => { assert.equal(await get("Dispositivo").inputValue(), ""); assert.equal(await get("Nombre visible").inputValue(), ""); assert.equal(await get("Identificador de vuelo").inputValue(), ""); const s = await page.evaluate(() => window.view()); assert.equal(s.event, null); assert.deepEqual(s.readings, {}); assert.deepEqual(s.history, []); assert.deepEqual(s.positions, []); };
  await get("Nombre visible").fill("Private Browser A"); await get("Identificador de vuelo").fill("CS01");
  await page.getByRole("button", { name: "Registrar dispositivo", exact: true }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('select[aria-label="Dispositivo"]').value));
  const deviceA = await get("Dispositivo").inputValue();
  // Machine credential stays in this test process. API/PostgreSQL produce the snapshot.
  const api = await browser.newContext({ ignoreHTTPSErrors: true });
  const req = async (path, token, method = "GET", data) => api.request.fetch(fixture.apiURL + path, { method, headers: { Authorization: `Bearer ${token}` }, ...(data && { data }) });
  const provisioned = await req(`/api/v1/devices/${deviceA}/sources`, fixture.a, "POST", { transport: "http" }); assert.equal(provisioned.status(), 201); const source = await provisioned.json();
  const packet = { envelopeVersion: 1, payload: { v: 2, id: "CS01", m: "E", n: 1, u: 1000, t: 0, st: 1, fl: 0, t1: 2465, rh: 5210, p1: 100843, gr: 128400 } };
  assert.equal((await req("/api/v1/ingestion/packets", source.credential, "POST", packet)).status(), 200);
  await page.waitForFunction(() => document.querySelector("output").textContent === "1");
  assert.ok(Object.keys((await page.evaluate(() => window.view())).readings).length > 0);
  // Hold a real A list response, switch to B; A rows cannot reappear.
  let releaseList; let listSeen; const seenList = new Promise(resolve => { listSeen = resolve; }); const heldList = new Promise(resolve => { releaseList = resolve; });
  const holdList = async route => { const response = await route.fetch(); listSeen(); await heldList; await route.fulfill({ response }).catch(() => {}); };
  await context.route(fixture.apiURL + "/api/v1/devices", holdList); await list(); await seenList;
  await switchTo("b"); await empty(); releaseList(); await delay(200); assert.doesNotMatch(await get("Dispositivo").innerText(), /Private Browser A/); await context.unroute(fixture.apiURL + "/api/v1/devices", holdList);
  await list(); await page.waitForFunction(() => !document.querySelector('button').disabled); await empty();
  assert.equal((await req(`/api/v1/devices/${deviceA}/snapshot`, fixture.b)).status(), 404);
  assert.equal((await req(`/api/v1/devices/${deviceA}/events`, fixture.b)).status(), 404);
  assert.equal((await req(`/api/v1/devices/${deviceA}/packets`, fixture.b)).status(), 404);
  assert.equal((await req(`/api/v1/devices/${deviceA}/packets.csv?m=E`, fixture.b)).status(), 404);
  assert.equal((await req(`/api/v1/devices/${deviceA}/sources/${source.id}`, fixture.b, "DELETE")).status(), 404);
  // An A create can commit on the server; its delayed result cannot select A in B.
  await switchTo("a"); await get("Nombre visible").fill("Late A create"); await get("Identificador de vuelo").fill("CS02");
  let releaseCreate; let created; const committed = new Promise(resolve => { created = resolve; }); const heldCreate = new Promise(resolve => { releaseCreate = resolve; });
  const holdCreate = async route => { if (route.request().method() !== "POST") return route.continue(); const response = await route.fetch(); assert.equal(response.status(), 201); created(); await heldCreate; await route.fulfill({ response }).catch(() => {}); };
  await context.route(fixture.apiURL + "/api/v1/devices", holdCreate); await page.getByRole("button", { name: "Registrar dispositivo", exact: true }).click(); await committed;
  await switchTo("b"); releaseCreate(); await delay(200); await empty(); assert.doesNotMatch(await get("Dispositivo").innerText(), /Late A|Private Browser A/); await context.unroute(fixture.apiURL + "/api/v1/devices", holdCreate);
  // A token delayed inside the provider must initiate zero stale REST requests.
  await switchTo("a"); await page.evaluate(() => window.holdToken()); let requests = 0;
  const track = request => { if (request.url() === fixture.apiURL + "/api/v1/devices") requests++; }; page.on("request", track);
  await list(); await switchTo("b"); await page.evaluate(() => window.releaseToken()); await delay(200); assert.equal(requests, 0); page.off("request", track); await empty();
  await switchTo("a"); await list(); await get("Dispositivo").selectOption(deviceA); await page.waitForFunction(() => document.querySelector("output").textContent === "1");
  await page.getByRole("button", { name: "Cerrar sesión" }).click(); await page.waitForFunction(() => document.querySelector("output").textContent === "empty"); await empty(); assert.equal(await page.getByRole("alert").count(), 0);
  await switchTo("expired"); await list(); await page.getByRole("alert").waitFor(); assert.match(await page.getByRole("alert").innerText(), /401/);
  await switchTo("b"); await empty(); assert.equal(await page.getByRole("alert").count(), 0);
  assert.equal((await req(`/api/v1/devices/${deviceA}/sources/${source.id}`, fixture.a, "DELETE")).status(), 204);
  assert.equal((await req("/api/v1/ingestion/packets", source.credential, "POST", packet)).status(), 401);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  await api.close(); console.log("PASS signed browser: real API/PG REST/SSE, A/B isolation, logout, expiry, late list/create/token, source revocation, empty browser storage");
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
