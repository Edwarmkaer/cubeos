import { APIClient } from "@cubeos/api-client";
import type { SubscriptionOptions } from "@cubeos/api-client";
import type { StoreApi } from "zustand";
import { nextSample } from "./simulator.ts";
import type { SourceSelection, TelemetryState } from "./telemetry-store.ts";
import { useTelemetryStore } from "./telemetry-store.ts";
import {createCloudSubscriber} from './cloud-source.ts';

// PR8 supplies a fresh Clerk token getter. Credentials stay only in memory.
let tokenGetter: (() => string | null | Promise<string | null>) | null = null;
let identityGeneration = 0;
export function setPublicTokenGetter(getter: typeof tokenGetter) {
  identityGeneration++;
  tokenGetter = getter;
  const s = useTelemetryStore.getState();
  if (s.selection.mode === "public") s.select({ ...s.selection, deviceId: "", deviceName: "" });
}
export async function sourceToken(mode: SourceSelection["mode"]) {
  if (mode !== "public") return null;
  const generation = identityGeneration;
  const token = await tokenGetter?.();
  if (!token || generation !== identityGeneration) throw new Error("Sesión no disponible. Inicia sesión de nuevo.");
  return token;
}
export function validateSelection(selection: SourceSelection) {
  if (selection.mode === "demo") return;
  const u = new URL(selection.apiURL);
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/") throw new Error("Usa el origen de la API sin credenciales ni parámetros.");
  if (selection.mode === "local" && (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !["http:", "https:"].includes(u.protocol))) throw new Error("La API local debe estar en loopback.");
  if (selection.mode === "public" && u.protocol !== "https:") throw new Error("La API pública requiere HTTPS.");
  if(selection.mode==='cloud'&&(u.protocol!=='https:'||!/^[a-z0-9-]+\.convex\.cloud$/.test(u.hostname)||u.port||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(selection.cloudChannelId??'')||!/^[a-f0-9]{64}$/.test(selection.cloudReadToken??'')))throw Error('Introduce URL Convex, canal y clave temporal válidos.');
}
type Subscriber = { subscribeTelemetry: (id: string, options: SubscriptionOptions) => Promise<void> };
export function startTelemetry(store: StoreApi<TelemetryState>, makeClient?: (url: string) => Subscriber) {
  const s = store.getState(); const { selection, generation } = s;
  if (selection.mode === "demo") {
    let current = s.latest!;
    const timer = setInterval(() => { current = nextSample(current); store.getState().push(current, generation); }, 500);
    return () => clearInterval(timer);
  }
  if (!selection.apiURL || (selection.mode==='cloud'?!selection.cloudReadToken:!selection.deviceId)) return () => {};
  const controller = new AbortController();
  const unsubscribe = store.subscribe(next => { if (next.generation !== generation) controller.abort(); });
  const live = () => !controller.signal.aborted && store.getState().generation === generation;
  const connection: SubscriptionOptions["onConnection"] = state => {
    if (!live()) return;
    if(state==='unauthorized'&&selection.mode==='cloud'){
     store.setState({selection:{...selection,cloudReadToken:''},generation:generation+1,event:null,readings:{},positions:[],latest:null,history:[],connection:'unauthorized',error:'Acceso cloud vencido o revocado. Solicita una nueva clave temporal.'});return;
    }
    if (state === "closed" && ["error", "unauthorized"].includes(store.getState().connection)) return;
    store.getState().setConnection(state, generation);
  };
  try {
    validateSelection(selection);
    const client=makeClient?makeClient(selection.apiURL):selection.mode==='cloud'?createCloudSubscriber(selection):new APIClient(selection.apiURL);
    void client.subscribeTelemetry(selection.deviceId, {
      signal: controller.signal, getToken: () => sourceToken(selection.mode), onConnection: connection,
      onSnapshot: event => { if (live()) store.getState().accept(event, generation); },
    }).catch(error => { if (live()) store.setState({ error: error instanceof Error ? error.message : "Error de fuente", connection: store.getState().connection === "unauthorized" ? "unauthorized" : "error" }); });
  } catch (error) { store.setState({ connection: "error", error: error instanceof Error ? error.message : "Configuración inválida" }); }
  return () => {
    if (live() && !["error", "unauthorized"].includes(store.getState().connection)) store.getState().setConnection("closed", generation);
    controller.abort();
    unsubscribe();
  };
}
