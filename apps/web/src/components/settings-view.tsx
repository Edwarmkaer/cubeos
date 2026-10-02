"use client";
import { useEffect, useRef, useState } from "react";
import { APIClient } from "@cubeos/api-client";
import type { Device } from "@cubeos/api-client";
import { Tile } from "@/components/visor/tile";
import { useTelemetryStore } from "@/lib/telemetry-store";
import type { SourceSelection } from "@/lib/telemetry-store";
import { sourceToken, validateSelection } from "@/lib/telemetry-source";
import { usePublicSession } from "./public-session";

const control = "w-full rounded-md bg-background px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50";

export function SettingsView() {
  const session = usePublicSession();
  const selection = useTelemetryStore(s => s.selection);
  const select = useTelemetryStore(s => s.select);
  const [draft, setDraft] = useState(selection);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [protocolId, setProtocolId] = useState("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = useTelemetryStore.subscribe((next, previous) => {
      if (next.generation === previous.generation) return;
      operation.current?.abort(); operation.current = null;
      setDraft(next.selection); setDevices([]); setError(null); setBusy(false); setName(""); setProtocolId("");
    });
    return () => { unsubscribe(); operation.current?.abort(); };
  }, []);
  function change(next: SourceSelection) {
    operation.current?.abort(); setBusy(false); setError(null); setDevices([]);
    const empty = { ...next, deviceId: "", deviceName: "" };
    setDraft(empty); select(empty);
  }
  function authenticate(action: (() => Promise<void>) | undefined, message: string) {
    const pending = action?.();
    const generation = useTelemetryStore.getState().generation;
    void pending?.catch(() => { if (useTelemetryStore.getState().generation === generation) setError(message); });
  }
  async function request(kind: "list" | "create" | "rename") {
    operation.current?.abort(); const c = new AbortController(); operation.current = c;
    const generation = useTelemetryStore.getState().generation;
    const live = () => !c.signal.aborted && operation.current === c && useTelemetryStore.getState().generation === generation;
    setError(null); setBusy(true);
    try {
      validateSelection(draft); const token = await sourceToken(draft.mode); if (!live()) return;
      const api = new APIClient(draft.apiURL);
      const device = kind === "create" ? await api.createDevice({ name, protocolDeviceId: protocolId }, token, c.signal)
        : kind === "rename" ? await api.renameDevice(draft.deviceId, name, token, c.signal) : null;
      if (!live()) return;
      const rows = await api.listDevices(token, c.signal);
      if (!live()) return;
      if (device) {
        // This synchronous selection is this operation's result. External changes
        // already invalidate it, including identity changes with the same origin.
        operation.current = null; setBusy(false);
        select({ ...draft, deviceId: device.id, deviceName: device.name });
      }
      setDevices(rows);
    } catch (e) { if (live()) setError(e instanceof Error ? e.message : "No se pudo consultar la API"); }
    finally { if (live()) { operation.current = null; setBusy(false); } }
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Tile title="Fuente de datos" className="min-h-full overflow-visible">
        <div className="max-w-lg space-y-4 pb-8">
          <label className="block text-sm text-muted-foreground">Origen
            <select aria-label="Origen" className={control} value={draft.mode} onChange={e => change({ ...draft, mode: e.target.value as SourceSelection["mode"], offline: e.target.value === "local" })}>
              <option value="local">API local</option><option value="public">API pública</option><option value="demo">DEMO · datos sintéticos</option>
            </select>
          </label>
          {draft.mode === "demo" ? <p className="text-sm text-muted-foreground">Simulador legacy a 2 Hz. Ángulos, batería y fotografías de ejemplo son sintéticos.</p> : <>
            <label className="block text-sm text-muted-foreground">URL de API
              <input className={control} type="url" value={draft.apiURL} placeholder={draft.mode === "local" ? "http://localhost:8080" : "https://api.example.com"} onChange={e => change({ ...draft, apiURL: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.offline} onChange={e => { const next = { ...draft, offline: e.target.checked }; setDraft(next); select(next); }} />Modo sin Internet (sin mapa remoto)</label>
            <p className="text-sm text-muted-foreground">La API local usa el perfil de esta instalación. La conexión API no prueba el enlace del receptor con el CubeSat.</p>
            {draft.mode === "public" ? <div className="space-y-2 text-sm text-muted-foreground">
              <p>{session.state === "unavailable" ? "Esta instalación local no carga autenticación online. Abre la instalación pública para iniciar sesión." : session.state === "loading" ? "Cargando sesión…" : session.state === "signed-in" ? "Sesión pública activa. El acceso requiere inscripción autorizada." : "Inicia sesión para consultar tus dispositivos."}</p>
              {session.state === "signed-in" ? <button type="button" className={control} onClick={() => authenticate(session.signOut, "No se pudo cerrar la sesión remota. El acceso a la cuenta se ha cerrado.")}>Cerrar sesión</button> : session.state === "signed-out" ? <button type="button" className={control} onClick={() => authenticate(session.signIn, "No se pudo iniciar sesión. Intenta de nuevo.")}>Iniciar sesión con Google</button> : null}
            </div> : null}
            <button type="button" className={control} disabled={busy || !draft.apiURL} onClick={() => void request("list")}>{busy ? "Consultando…" : "Consultar dispositivos"}</button>
            <label className="block text-sm text-muted-foreground">Dispositivo
              <select aria-label="Dispositivo" className={control} value={draft.deviceId} disabled={busy} onChange={e => { const d = devices.find(row => row.id === e.target.value); const next = { ...draft, deviceId: d?.id ?? "", deviceName: d?.name ?? "" }; setDraft(next); select(next); setName(d?.name ?? ""); }}>
                <option value="">Selecciona un dispositivo</option>
                {draft.deviceId && !devices.some(d => d.id === draft.deviceId) ? <option value={draft.deviceId}>{draft.deviceName}</option> : null}
                {devices.map(d => <option key={d.id} value={d.id}>{d.name} · {d.protocolDeviceId} · {d.id}</option>)}
              </select>
            </label>
            {!busy && devices.length === 0 ? <p className="text-sm text-muted-foreground">Consulta tus dispositivos o registra uno.</p> : null}
            <label className="block text-sm text-muted-foreground">Nombre visible<input className={control} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="block text-sm text-muted-foreground">Identificador de vuelo<input className={control} value={protocolId} onChange={e => setProtocolId(e.target.value)} placeholder="CS01" /></label>
            <div className="flex gap-3"><button type="button" className={control} disabled={busy || !name.trim() || !protocolId.trim()} onClick={() => void request("create")}>Registrar dispositivo</button><button type="button" className={control} disabled={busy || !draft.deviceId || !name.trim()} onClick={() => void request("rename")}>Renombrar</button></div>
          </>}
          {error ? <p role="alert" className="text-sm text-muted-foreground">{error}</p> : null}
        </div>
      </Tile>
    </div>
  );
}
