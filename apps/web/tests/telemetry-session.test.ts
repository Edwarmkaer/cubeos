import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { useTelemetryStore } from "../src/lib/telemetry-store.ts";
import { startTelemetry, validateSelection, setPublicTokenGetter, sourceToken } from "../src/lib/telemetry-source.ts";
import type { SubscriptionOptions } from "@cubeos/api-client";

const snapshot = JSON.parse(readFileSync(new URL("../../../packages/contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json", import.meta.url), "utf8"));
const ev = (id: string) => ({ revision: Number(id), revisionId: id, snapshot, freshnessByGroup: {} });
const local = { mode: "local" as const, apiURL: "http://localhost:8087", deviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", deviceName: "A", offline: true };

test("real starts empty; demo is explicit and cannot survive mode/device switches", () => {
  const s = useTelemetryStore.getState(); assert.equal(s.event, null); assert.equal(s.latest, null);
  s.select({ ...local, mode: "demo" }); assert.ok(useTelemetryStore.getState().latest);
  s.select(local); assert.equal(useTelemetryStore.getState().latest, null); assert.equal(useTelemetryStore.getState().history.length, 0);
  const generation = useTelemetryStore.getState().generation;
  s.accept(ev("9007199254740993"), generation); s.accept(ev("9007199254740992"), generation);
  assert.equal(useTelemetryStore.getState().event?.revisionId, "9007199254740993");
  s.select({ ...local, deviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
  s.accept(ev("9007199254740994"), generation);
  assert.equal(useTelemetryStore.getState().event, null);
});

test("session cancels old subscription and ignores late callbacks, terminal error remains visible", async () => {
  const s = useTelemetryStore.getState(); s.select(local);
  let handlers!: SubscriptionOptions; let signal!: AbortSignal;
  const client = { subscribeTelemetry: async (_id: string, h: SubscriptionOptions) => { handlers = h; signal = h.signal; await new Promise<void>(r => h.signal.addEventListener("abort", () => r())); h.onConnection("closed"); } };
  const stop = startTelemetry(useTelemetryStore, () => client);
  handlers.onSnapshot(ev("1")); assert.equal(useTelemetryStore.getState().event?.revisionId, "1");
  s.select({ ...local, deviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
  stop(); assert.equal(signal.aborted, true);
  handlers.onSnapshot(ev("2")); assert.equal(useTelemetryStore.getState().event, null);
  const stop2 = startTelemetry(useTelemetryStore, () => ({ subscribeTelemetry: async (_id, h) => { h.onConnection("unauthorized"); h.onConnection("closed"); throw new Error("denied"); } }));
  await new Promise(r => setTimeout(r, 0)); assert.equal(useTelemetryStore.getState().connection, "unauthorized"); stop2();
});

test("local only accepts loopback, public requires HTTPS and fails closed without identity", () => {
  assert.throws(() => validateSelection({ ...local, apiURL: "http://example.com" }));
  assert.throws(() => validateSelection({ ...local, apiURL: "http://localhost:8087?token=secret" }));
  assert.throws(() => validateSelection({ ...local, mode: "public", apiURL: "http://example.com" }));
  assert.doesNotThrow(() => validateSelection(local));
});

test("changing public identity clears the old snapshot; public never falls back to local identity", async () => {
  await assert.rejects(sourceToken("public"), /Sesión no disponible/);
  const s = useTelemetryStore.getState(); s.select({ ...local, mode: "public", apiURL: "https://api.example.com" });
  const generation = useTelemetryStore.getState().generation;
  s.accept(ev("1"), generation);
  setPublicTokenGetter(() => "fresh-session-token");
  assert.equal(useTelemetryStore.getState().event, null);
  assert.ok(useTelemetryStore.getState().generation > generation);
  assert.equal(useTelemetryStore.getState().selection.deviceId, "", "previous account UUID must not survive identity change");
  assert.equal(useTelemetryStore.getState().selection.deviceName, "", "previous account private device name must not survive identity change");
  assert.equal(await sourceToken("public"), "fresh-session-token");
  setPublicTokenGetter(null);
  await assert.rejects(sourceToken("public"), /Sesión no disponible/);
  assert.equal(await sourceToken("local"), null);
});

test("a late token from the previous public account is rejected before use", async () => {
  let release!: (value: string) => void;
  setPublicTokenGetter(() => new Promise<string>(resolve => { release = resolve; }));
  const pending = sourceToken("public");
  setPublicTokenGetter(() => "B");
  release("A");
  await assert.rejects(pending, /Sesión/);
  assert.equal(await sourceToken("public"), "B");
  setPublicTokenGetter(null);
});

test("identity change immediately aborts SSE even without a React effect cleanup", async () => {
  setPublicTokenGetter(() => "A");
  useTelemetryStore.getState().select({ ...local, mode: "public", apiURL: "https://api.example.com" });
  let signal!: AbortSignal;
  const stop = startTelemetry(useTelemetryStore, () => ({ subscribeTelemetry: async (_id, h) => { signal = h.signal; await new Promise<void>(resolve => h.signal.addEventListener("abort", () => resolve())); } }));
  setPublicTokenGetter(null);
  assert.equal(signal.aborted, true);
  stop();
});
