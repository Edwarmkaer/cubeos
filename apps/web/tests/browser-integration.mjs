// Real PostgreSQL, API binary, simulator CLI and browser. No mocked REST/SSE.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const binary = process.env.CUBEOS_API_BINARY;
const database = process.env.TEST_BROWSER_DATABASE_URL;
assert.ok(binary && database, "built API and exclusive browser database required");
const web = process.env.CUBEOS_WEB_URL ?? "http://localhost:3108";
const port = process.env.CUBEOS_BROWSER_API_PORT ?? "8087";
const base = `http://localhost:${port}`;
const evidence = process.env.CUBEOS_BROWSER_EVIDENCE_DIR ?? ".superpowers/sdd/2026-10-01-cubeos-backend/pr7-browser";
await mkdir(evidence, { recursive: true });
const env = { ...process.env, DATABASE_URL: database, PORT: port, LISTEN_HOST: "127.0.0.1", DEPLOYMENT_MODE: "local", AUTH_MODE: "local", ALLOWED_ORIGIN: web, LOCAL_CONTAINER: "false", SERIAL_PORT: "", SERIAL_SOURCE_ID: "", SERIAL_BAUD: "", INGESTION_ADDRESS: "" };
execFileSync(binary, ["migrate"], { env, stdio: "pipe" });
let api;
let exiting;
function startAPI() { api = spawn(binary, [], { env, stdio: "ignore" }); exiting = once(api, "exit"); }
async function stopAPI() { api.kill("SIGTERM"); await exiting; }
startAPI();
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/readyz")).ok) return; } catch { /* bounded startup */ } if (api.exitCode !== null) throw new Error("API exited"); await delay(100); }
  throw new Error("API readiness timeout");
}
async function request(path, method = "GET", body, credential) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", ...(credential && { Authorization: `Bearer ${credential}` }) }, ...(body && { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `HTTP ${response.status} on ${path}`); return response.status === 204 ? null : response.json();
}
let browser;
try {
  await ready();
  const device = await request("/api/v1/devices", "POST", { name: "PR7 Browser CubeSat", protocolDeviceId: "CS01" });
  const empty = await request("/api/v1/devices", "POST", { name: "PR7 Empty CubeSat", protocolDeviceId: "CS02" });
  const source = await request(`/api/v1/devices/${device.id}/sources`, "POST", { transport: "http", gatewayId: "SIMULATOR" });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = []; const external = [];
  page.on("pageerror", error => errors.push(error.message));
  // Block AND record forbidden egress; any attempted external request fails the gate.
  await context.route("**/*", route => { const url = new URL(route.request().url()); if (!["localhost", "127.0.0.1"].includes(url.hostname)) { external.push(url.origin); return route.abort(); } return route.continue(); });
  const text = () => page.locator("main").innerText();
  async function expectText(pattern) { for (let i = 0; i < 150; i++) { if (pattern.test(await text())) return; await delay(100); } assert.match(await text(), pattern); }
  const tile = title => page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await page.goto(web + "/visor");
  await expectText(/Esperando primera muestra real/);
  assert.equal(await page.locator('img[src*="demo/camera"]').count(), 0);
  assert.doesNotMatch(await text(), /12\.046|77\.043|7\.62|Roll|Pitch|Yaw/);
  await page.screenshot({ path: `${evidence}/waiting-desktop.png` });
  await page.getByRole("link", { name: "Configurar fuente" }).click();
  await page.getByLabel("URL de API").fill(base);
  await page.getByRole("button", { name: "Consultar dispositivos" }).click();
  await page.getByLabel("Dispositivo", { exact: true }).selectOption(device.id);
  // Browser REST creation and rename go through exact-origin CORS/Host checks.
  await page.getByLabel("Nombre visible").fill("PR7 Renamed CubeSat");
  await page.getByRole("button", { name: "Renombrar" }).click();
  for (let i = 0; i < 100; i++) { if ((await page.getByLabel("Dispositivo", { exact: true }).locator('option:checked').textContent()).includes("PR7 Renamed")) break; await delay(50); }
  assert.match(await page.getByLabel("Dispositivo", { exact: true }).locator('option:checked').textContent(), /PR7 Renamed/);
  await page.getByRole("link", { name: "Visor", exact: true }).first().click();
  await expectText(/API conectada/);
  await expectText(/Esperando primera muestra real/);
  const cli = spawn(process.execPath, ["tools/simulator/src/index.ts", "--transport", "http", "--url", base + "/api/v1/ingestion/packets", "--seed", "42", "--duration-ms", "2000", "--rate", "10"], { env: { ...process.env, CUBEOS_SOURCE_CREDENTIAL: source.credential }, stdio: "ignore" });
  const [code] = await once(cli, "exit"); assert.equal(code, 0);
  await expectText(/Revisión 10/);
  assert.match(await tile("Velocidad angular").innerText(), /0\.120.*°\/s/s);
  assert.match(await tile("Luz UV").innerText(), /1830.*cuentas.*1474.*mV/s);
  assert.match(await tile("Presión").innerText(), /100843.*Pa/s);
  assert.match(await tile("Humedad").innerText(), /52\.10.*%/s);
  // The CLI deliberately emits fl bit 0 (GPS_UNAVAILABLE), a fault rather
  // than asserting that the receiver hardware has no installed GPS.
  assert.match(await tile("GPS").innerText(), /Fallo de GPS/);
  assert.match(await tile("CubeSat").innerText(), /— V/);
  assert.match(await tile("Paneles").innerText(), /Sin medición independiente/);
  assert.match(await tile("Cámara").innerText(), /operativa.*23842.*MB/s);
  assert.equal(await page.locator('img[src*="demo/camera"]').count(), 0);
  assert.match(await tile("Visor 3D").innerText(), /Actitud pendiente/);
  const panelBounds = await tile("Telemetría").boundingBox();
  const linkBounds = await page.getByRole("link", { name: "Configurar fuente" }).boundingBox();
  assert.ok(linkBounds && panelBounds && linkBounds.y >= panelBounds.y && linkBounds.y + linkBounds.height <= panelBounds.y + panelBounds.height, "source link clipped outside telemetry panel");
  await page.screenshot({ path: `${evidence}/live-desktop.png` });
  // Optional known fields outside their primary message group, valid zeros and
  // deployment bits (6/7) must not be rendered as sensor faults.
  const h = { v: 2, id: "CS01", m: "H", n: 10, u: 2000, t: 0, st: 1, fl: 192, cam: 1, sd: 0, dp: 1,
    t1: 0, rh: 0, bv: 7620, bi: 100, bp: 762, gx: 0, gy: 0, gz: 0, la: 0, lo: 0, al: 1234, sp: 0, hd: 0, fx: 1, sa: 0 };
  await request("/api/v1/ingestion/packets", "POST", { envelopeVersion: 1, payload: h }, source.credential);
  await expectText(/Revisión 11/);
  assert.match(await tile("GPS").innerText(), /Calidad de fix desconocida/);
  assert.match(await tile("Temp").innerText(), /0\.00.*°C/s);
  assert.match(await tile("CubeSat").innerText(), /7\.62 V.*0\.100 A.*0\.762 W/s);
  const voltageBounds = await tile("CubeSat").locator("p").nth(0).boundingBox();
  const voltageAgeBounds = await tile("CubeSat").locator("p").nth(1).boundingBox();
  assert.ok(voltageBounds.y + voltageBounds.height <= voltageAgeBounds.y, "battery voltage and age overlap");
  assert.equal(await tile("CubeSat").getByRole("img", { name: /por ciento/ }).count(), 0);
  assert.doesNotMatch(await tile("Telemetría").innerText(), /SENSOR_FAILURE/);
  await request("/api/v1/ingestion/packets", "POST", { envelopeVersion: 1, payload: { ...h, n: 11, u: 2500, fx: 3 } }, source.credential);
  await expectText(/Revisión 12/);
  assert.match(await tile("GPS").innerText(), /0\.0000000°.*0\.0000000°.*12\.34 m/s);
  assert.match(await tile("GPS").innerText(), /mapa base desactivado/);
  const prior = await tile("Temp").locator("path").getAttribute("d");
  await request("/api/v1/ingestion/packets", "POST", { envelopeVersion: 1, payload: { ...h, n: 11, u: 2500, fx: 3 } }, source.credential);
  await delay(200); assert.equal(await tile("Temp").locator("path").getAttribute("d"), prior);
  await stopAPI(); await expectText(/Reconectando API/); startAPI(); await ready(); await expectText(/API conectada/);
  assert.match(await text(), /Revisión 12/);
  await delay(11000); await expectText(/Antigua.*hace 1[1-9] s/);
  await page.screenshot({ path: `${evidence}/stale-desktop.png` });
  await request("/api/v1/ingestion/packets", "POST", { envelopeVersion: 1, payload: { ...h, n: 12, u: 3000, fl: 24, cam: 0, fx: 3 } }, source.credential);
  await expectText(/Revisión 13/);
  assert.match(await tile("Cámara").innerText(), /Estado de cámara: fallo.*SD fallo/s);
  // Device change removes all old state immediately; no synthetic fallback.
  await page.getByRole("link", { name: "Configurar fuente" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Consultar dispositivos" }).click();
  await page.getByLabel("Dispositivo", { exact: true }).selectOption(empty.id);
  await page.getByRole("link", { name: "Visor", exact: true }).first().click();
  await expectText(/Esperando primera muestra real/); assert.doesNotMatch(await text(), /7\.62|Revisión 12|1830/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const region = document.querySelector('[aria-label="Paneles de telemetría"]');
    return window.innerWidth === 390 && region.clientWidth <= 390 && region.scrollWidth > region.clientWidth;
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "page-level accidental horizontal overflow");
  const panels = page.getByRole("region", { name: "Paneles de telemetría", exact: true });
  assert.ok(await panels.evaluate(e => e.scrollWidth > e.clientWidth), "mobile bento must preserve its intentional internal horizontal scroll");
  await panels.focus(); await page.keyboard.press("ArrowRight");
  await delay(250);
  assert.ok(await panels.evaluate(e => e.scrollLeft > 0), "keyboard must actually scroll dashboard horizontally");
  for (const label of ["Luz", "Luz UV", "Velocidad angular", "GPS", "Presión", "Temp", "Humedad", "Visor 3D", "Telemetría", "CubeSat", "Paneles", "Cámara"]) {
    const heading = page.getByRole("heading", { name: label, exact: true });
    await heading.evaluate(e => e.scrollIntoView({ block: "nearest", inline: "start" }));
    // h2 spans its whole grid region; test the rendered title's text range,
    // not the intentionally wider bento box.
    const box = await heading.evaluate(e => { const range = document.createRange(); range.selectNodeContents(e); const b = range.getBoundingClientRect(); return { x: b.x, width: b.width }; });
    assert.ok(box.x >= 0 && box.x + box.width <= 390, `${label} inaccessible in horizontal mobile bento`);
  }
  const z = tile("Velocidad angular").getByText("Z", { exact: true }); await z.scrollIntoViewIfNeeded();
  const zbox = await z.boundingBox(); assert.ok(zbox && zbox.x >= 0 && zbox.x + zbox.width <= 390, "third angular axis inaccessible");
  await panels.evaluate(e => { e.scrollLeft = 0; });
  await page.screenshot({ path: `${evidence}/waiting-mobile.png` });
  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await page.getByLabel("Origen", { exact: true }).selectOption("public");
  await page.getByLabel("URL de API").fill("https://api.example.com");
  await page.getByRole("button", { name: "Consultar dispositivos" }).click();
  await page.locator("main").getByRole("alert").waitFor();
  assert.match(await page.locator("main").getByRole("alert").innerText(), /Sesión no disponible/);
  assert.deepEqual(external, [], "local mode attempted external requests");
  await context.unroute("**/*");
  await page.getByLabel("Origen", { exact: true }).selectOption("demo");
  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await page.getByRole("link", { name: "Visor", exact: true }).last().click();
  await page.getByRole("heading", { name: "Visor de telemetría", exact: true }).waitFor();
  await expectText(/Simulado/);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('img[src^="/demo/camera/"]')];
    return images.length === 6 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  assert.equal(await page.getByRole("img", { name: /Vista|Reflejo|Relieve/ }).count(), 6);
  assert.match(await page.locator("header").innerText(), /DEMO.*sintética/);
  await page.screenshot({ path: `${evidence}/demo-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${evidence}/demo-desktop.png` });
  // DEMO's online map is explicitly outside the offline check; before demo the
  // recorded egress list MUST have been empty, including identity attempts.
  assert.deepEqual(errors, [], "browser runtime errors");
  console.log("PASS: real browser REST/SSE + simulator/PG, units/zero/fx1/pending, reconnect, idle age, mode/device cancellation, public fail-closed, offline and mobile/demo");
} catch (error) {
  console.error(error.message);
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    await page?.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
    console.error(await page?.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.clientWidth, panels: document.querySelector('[aria-label="Paneles de telemetría"]')?.clientWidth, bento: document.querySelector(".dashboard-bento")?.scrollWidth, minimum: document.querySelector(".dashboard-bento") && getComputedStyle(document.querySelector(".dashboard-bento")).minWidth })).catch(() => null));
  }
  throw error;
} finally {
  await browser?.close();
  if (api?.exitCode === null) await stopAPI();
}
