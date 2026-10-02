// Test-only entrypoint, bundled by browser-auth.mjs and never routed by Next.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { SettingsView } from "../src/components/settings-view";
import { PublicSessionContext, usePublicIdentity } from "../src/components/public-session";
import { useTelemetryStore } from "../src/lib/telemetry-store";
import { startTelemetry } from "../src/lib/telemetry-source";

declare global {
  interface Window {
    fixture: { apiURL: string; a: string; b: string; expired: string };
    account: (value: "a" | "b" | "expired" | null) => void;
    view: () => { selection: unknown; event: unknown; readings: unknown; history: unknown; positions: unknown; connection: string; generation: number };
    holdToken: () => void;
    releaseToken: () => void;
  }
}
let release: (() => void) | undefined;
let hold: Promise<void> | null = null;
window.holdToken = () => { hold = new Promise<void>(resolve => { release = resolve; }); };
window.releaseToken = () => { release?.(); hold = null; };
useTelemetryStore.getState().select({ mode: "public", apiURL: window.fixture.apiURL, deviceId: "", deviceName: "", offline: true });
window.view = () => { const s = useTelemetryStore.getState(); return { selection: s.selection, event: s.event, readings: s.readings, history: s.history, positions: s.positions, connection: s.connection, generation: s.generation }; };

function Fixture() {
  const [account, setAccount] = useState<"a" | "b" | "expired" | null>("a");
  useEffect(() => { window.account = setAccount; }, []);
  usePublicIdentity(account, async () => { const token = account ? window.fixture[account] : null; if (hold) await hold; return token; });
  const generation = useTelemetryStore(s => s.generation);
  const event = useTelemetryStore(s => s.event);
  useEffect(() => startTelemetry(useTelemetryStore), [generation]);
  return <PublicSessionContext.Provider value={{ state: account ? "signed-in" : "signed-out", signOut: async () => setAccount(null), signIn: async () => setAccount("a") }}>
    <main><SettingsView /><output aria-label="Revision">{event?.revisionId ?? "empty"}</output></main>
  </PublicSessionContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
