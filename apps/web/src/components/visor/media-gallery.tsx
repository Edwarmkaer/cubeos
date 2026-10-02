"use client";

import { useEffect, useRef, useState } from "react";
import { APIClient } from "@cubeos/api-client";
import { startMedia, useMediaStore } from "@/lib/media-store";
import { useTelemetryStore } from "@/lib/telemetry-store";
import { sourceToken, validateSelection } from "@/lib/telemetry-source";
import { CameraGallery } from "./camera-gallery";

export function MediaGallery() {
 const state = useMediaStore();
 const generation = useTelemetryStore(s => s.generation);
 const session = useRef<ReturnType<typeof startMedia> | null>(null);
 useEffect(() => {
  session.current = startMedia(useTelemetryStore);
  const imported = () => session.current?.reload();
  window.addEventListener("cubeos-media-imported", imported);
  return () => { window.removeEventListener("cubeos-media-imported", imported); session.current?.stop(); session.current = null; };
 }, []);
 useEffect(() => { if (state.status === "ready" && state.nextCursor && state.frames.length <= 3) void session.current?.more(); }, [state.status, state.nextCursor, state.frames.length]);
 const current = state.generation === generation;
 return <div className="relative flex min-h-0 flex-1 flex-col">
  <CameraGallery frames={current ? state.frames : []} onSelect={id => { void session.current?.download(id); }} onNearEnd={() => { void session.current?.more(); }} />
  {current && state.error ? <p role="alert" className="text-xs text-muted-foreground">No se pudieron cargar las capturas. <button type="button" className="underline focus-visible:outline-2" onClick={() => session.current?.reload()}>Reintentar</button></p> : null}
  <span className="sr-only" role="status">{current && state.status === "downloading" ? "Descargando original" : current && state.status === "loading" ? "Cargando capturas" : ""}</span>
 </div>;
}

export function MediaImport() {
 const { selection, generation } = useTelemetryStore();
 const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
 const operation = useRef<AbortController | null>(null);
 useEffect(() => {
  const unsubscribe = useTelemetryStore.subscribe((next, previous) => {
   if (next.generation !== previous.generation) { operation.current?.abort(); operation.current = null; setStatus("idle"); }
  });
  return () => { operation.current?.abort(); unsubscribe(); };
 }, []);
 if (selection.mode === "demo" || !selection.deviceId) return null;
 async function upload(file: File) {
  operation.current?.abort(); const c = new AbortController(); operation.current = c;
  const g = generation, live = () => !c.signal.aborted && useTelemetryStore.getState().generation === g;
  setStatus("uploading");
  try {
   validateSelection(selection); const token = await sourceToken(selection.mode); if (!live()) return;
   await new APIClient(selection.apiURL).uploadPhoto(selection.deviceId, file, null, token, c.signal);
   if (live()) { setStatus("done"); window.dispatchEvent(new Event("cubeos-media-imported")); }
  } catch { if (live()) setStatus("error"); }
 }
 return <div className="space-y-2">
  <label className="block text-sm text-muted-foreground">Importar fotografía
   <input key={generation} type="file" accept="image/jpeg,image/png" aria-label="Importar fotografía" disabled={status === "uploading"} className="block w-full rounded-md bg-background px-3 py-2 text-base text-foreground focus-visible:outline-2 disabled:opacity-50" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} />
  </label>
  <p role={status === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">{status === "uploading" ? "Importando fotografía…" : status === "done" ? "Fotografía importada." : status === "error" ? "No se pudo importar. Consulta las capturas antes de volver a intentarlo." : ""}</p>
 </div>;
}
