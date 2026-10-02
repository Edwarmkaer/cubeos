// Prepared Next build; prove server runtime mode and fail-closed boundaries.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = process.env.CUBEOS_AUTH_EVIDENCE_DIR ?? `${root}/.superpowers/sdd/pr8-auth/runtime`;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
async function check(mode, key, port) {
  const log = await open(`${evidence}/${mode}-${port}.log`, "w");
  const env = { ...process.env, DEPLOYMENT_MODE: mode, CLERK_PUBLISHABLE_KEY: key, NEXT_TELEMETRY_DISABLED: "1" };
  const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], { cwd: `${root}/apps/web`, env, stdio: ["ignore", log.fd, log.fd] });
  const exit = once(proc, "exit");
  let context;
  try {
    const base = `http://localhost:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/configuracion")).ok) break; } catch { /* startup */ } if (proc.exitCode !== null) throw new Error("Next runtime exited"); await delay(100); }
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const external = []; const errors = [];
    await context.route("**/*", route => { const u = new URL(route.request().url()); if (!["localhost", "127.0.0.1"].includes(u.hostname)) { external.push(u.origin); return route.abort(); } return route.continue(); });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/configuracion", { waitUntil: "domcontentloaded" });
    if (mode === "local") {
      await page.getByLabel("Origen", { exact: true }).selectOption("public");
      await page.getByText("Esta instalación local no carga autenticación online.", { exact: false }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Iniciar sesión con Google" }).count(), 0);
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
      await page.screenshot({ path: `${evidence}/local-public-source-desktop.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${evidence}/local-public-source-mobile.png` });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "configuration overflows horizontally");
    } else if (!key.startsWith("pk_")) {
      await page.getByRole("alert").filter({ hasText: "Configuración pública incompleta" }).waitFor();
      assert.equal(await page.getByLabel("Origen", { exact: true }).count(), 0);
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
      await page.screenshot({ path: `${evidence}/public-closed-${port}.png` });
    } else {
      // A syntactically valid isolated key with remote SDK egress blocked must
      // never create a usable public identity or initiate unauthenticated REST.
      await page.waitForFunction(() => Boolean(document.querySelector('select[aria-label="Origen"]')) || document.body.innerText.includes("Autenticación pública no disponible"));
      if (await page.getByLabel("Origen", { exact: true }).count()) {
        await page.getByLabel("Origen", { exact: true }).selectOption("public");
        await page.getByLabel("URL de API", { exact: true }).fill("https://api.example.com");
        await page.getByRole("button", { name: "Consultar dispositivos" }).click();
        const sessionError = page.getByRole("alert").filter({ hasText: "Sesión no disponible" });
        await sessionError.waitFor();
        assert.match(await sessionError.innerText(), /Sesión no disponible/);
      }
      assert.ok(!external.includes("https://api.example.com"), "provider failure initiated unauthorized REST");
      await page.screenshot({ path: `${evidence}/public-sdk-unavailable.png` });
    }
  } finally { await context?.close(); proc.kill("SIGTERM"); await exit; await log.close(); }
}
try {
  await check("local", "ignored-local-key", 3121);
  await check("public", "", 3122);
  await check("public", "broken", 3123);
  await check("public", "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk", 3124);
  console.log("PASS prepared Next runtime: local has zero remote auth requests; public missing/broken config closed; desktop/mobile");
} finally { await browser.close(); }
