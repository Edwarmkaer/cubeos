import { create } from "zustand";
import type { StoreApi } from "zustand";
import { APIClient } from "@cubeos/api-client";
import type { Photo } from "@cubeos/api-client";
import type { TelemetryState } from "./telemetry-store.ts";
import { sourceToken, validateSelection } from "./telemetry-source.ts";

type Frame = { id: string; src: string; alt: string };
type MediaState = { generation: number; photos: Photo[]; frames: Frame[]; selected: string | null; nextCursor: string; status: "pending" | "loading" | "ready" | "uploading" | "downloading" | "error"; error: string | null };
const empty = (): MediaState => ({ generation: -1, photos: [], frames: [], selected: null, nextCursor: "", status: "pending", error: null });
export const useMediaStore = create<MediaState>(() => empty());

export function startMedia(source: StoreApi<TelemetryState>) {
 let controller: AbortController, stopped = false, generation = -1, paging = false;
 const urls = new Set<string>();
 const revoke = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
 const live = (g: number, signal: AbortSignal) => !stopped && !signal.aborted && source.getState().generation === g;
 async function page(cursor: string, g: number, signal: AbortSignal) {
  const { selection } = source.getState(); validateSelection(selection);
  const client = new APIClient(selection.apiURL), token = await sourceToken(selection.mode);
  if (!live(g, signal)) return;
  const result = await client.listPhotos(selection.deviceId, { limit: 24, cursor }, token, signal);
  if (!live(g, signal)) return;
  // Sequential thumbnail reads keep resource usage bounded. Auth and bytes stay
  // in memory; DOM receives revocable blob URLs rather than bearer/signed URLs.
  const frames: Frame[] = [];
  for (const photo of result.items) {
   if (photo.status !== "ready" || !photo.hasThumbnail) continue;
   const fresh = await sourceToken(selection.mode);
   if (!live(g, signal)) return;
   const blob = await client.photoBlob(photo.id, "thumbnail", fresh, signal);
   if (!live(g, signal)) return;
   const url = URL.createObjectURL(blob); urls.add(url); frames.push({ id: photo.id, src: url, alt: "Captura del CubeSat" });
  }
  if (live(g, signal)) useMediaStore.setState(s => ({ photos: cursor ? [...s.photos, ...result.items] : result.items, frames: cursor ? [...s.frames, ...frames] : frames, nextCursor: result.nextCursor, status: "ready", error: null }));
 }
 const reset = () => {
  controller?.abort(); controller = new AbortController(); revoke(); paging = false;
  const { selection, generation: g } = source.getState(); generation = g;
  useMediaStore.setState({ ...empty(), generation: g });
  if (selection.mode === "demo" || !selection.apiURL || !selection.deviceId) return;
  const signal = controller.signal;
  useMediaStore.setState({ status: "loading" });
  void page("", g, signal).catch(error => fail(error, g, signal));
 };
 const fail = (error: unknown, g: number, signal: AbortSignal) => {
  if (live(g, signal)) useMediaStore.setState({ status: "error", error: error instanceof Error ? error.message : "No se pudieron cargar las capturas." });
 };
 const unsubscribe = source.subscribe(next => { if (next.generation !== generation) reset(); }); reset();
 return {
  reload: reset,
  async more() {
   const s = useMediaStore.getState(), g = generation, signal = controller.signal;
   if (!s.nextCursor || paging || s.status !== "ready" || !live(g, signal)) return;
   paging = true;
   try { await page(s.nextCursor, g, signal); } catch (error) { fail(error, g, signal); } finally { if (live(g, signal)) paging = false; }
  },
  async upload(file: File) {
   const { selection, generation: g } = source.getState(), signal = controller.signal;
   if (!live(g, signal) || selection.mode === "demo" || !selection.deviceId) return;
   useMediaStore.setState({ status: "uploading", error: null });
   try {
    validateSelection(selection); const token = await sourceToken(selection.mode);
    if (!live(g, signal)) return;
    await new APIClient(selection.apiURL).uploadPhoto(selection.deviceId, file, null, token, signal);
    if (live(g, signal)) reset();
   } catch (error) { fail(error, g, signal); }
  },
  async download(id: string) {
   const { selection, generation: g } = source.getState(), signal = controller.signal;
   if (!live(g, signal) || useMediaStore.getState().status === "downloading") return;
   const photo = useMediaStore.getState().photos.find(p => p.id === id);
   if (!photo || photo.status !== "ready") return;
   useMediaStore.setState({ selected: id, status: "downloading", error: null });
   try {
    const token = await sourceToken(selection.mode); if (!live(g, signal)) return;
    const blob = await new APIClient(selection.apiURL).photoBlob(id, "original", token, signal);
    if (!live(g, signal)) return;
    const url = URL.createObjectURL(blob); urls.add(url);
    const a = document.createElement("a"); a.href = url; a.download = `${id}.${photo.contentType === "image/png" ? "png" : "jpg"}`; a.click(); URL.revokeObjectURL(url); urls.delete(url);
    if (live(g, signal)) useMediaStore.setState({ status: "ready", selected: null });
   } catch (error) { fail(error, g, signal); }
  },
  stop() { stopped = true; controller.abort(); unsubscribe(); revoke(); useMediaStore.setState(empty()); },
 };
}
