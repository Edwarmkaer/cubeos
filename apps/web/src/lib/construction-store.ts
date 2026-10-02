import { create } from "zustand";
import type { StoreApi } from "zustand";
import { APIClient } from "@cubeos/api-client";
import type { ConstructionProgress } from "@cubeos/api-client";
import type { TelemetryState } from "./telemetry-store.ts";
import { sourceToken, validateSelection } from "./telemetry-source.ts";

type ConstructionState = { generation: number; progress: ConstructionProgress | null; status: "pending" | "loading" | "ready" | "saving" | "error"; error: string | null };
export const useConstructionStore = create<ConstructionState>(() => ({ generation: -1, progress: null, status: "pending", error: null }));

// The selected identity/device owns every request. Cancellation cannot undo a
// committed server write, but no previous generation can populate the next view.
export function startConstruction(source: StoreApi<TelemetryState>) {
 let controller: AbortController;
 let stopped = false;
 let generation = -1;
 const live = (g: number, signal: AbortSignal) => !stopped && !signal.aborted && source.getState().generation === g;
 const reset = () => {
  controller?.abort(); controller = new AbortController();
  const { selection, generation: g } = source.getState(); generation = g;
  const signal = controller.signal;
  useConstructionStore.setState({ generation: g, progress: null, status: "pending", error: null });
  if (selection.mode === "demo" || !selection.apiURL || !selection.deviceId) return;
  useConstructionStore.setState({ status: "loading" });
  void (async () => {
   try {
    validateSelection(selection);
    const token = await sourceToken(selection.mode);
    if (!live(g, signal)) return;
    const progress = await new APIClient(selection.apiURL).getProgress(selection.deviceId, token, signal);
    if (live(g, signal)) useConstructionStore.setState({ progress, status: "ready" });
   } catch (error) { if (live(g, signal)) useConstructionStore.setState({ progress: null, status: "error", error: error instanceof Error ? error.message : "No se pudo cargar el progreso." }); }
  })();
 };
 const unsubscribe = source.subscribe(next => { if (next.generation !== generation) reset(); });
 reset();
 return {
  async save(stepId: string, completed: boolean) {
   const { selection, generation: g } = source.getState();
   const s = useConstructionStore.getState(), signal = controller.signal;
   if (s.generation !== g || !s.progress || s.status === "saving" || !live(g,signal)) return;
   useConstructionStore.setState({ status: "saving", error: null });
   try {
    validateSelection(selection);
    const token = await sourceToken(selection.mode);
    if (!live(g, signal)) return;
    const progress = await new APIClient(selection.apiURL).setStepCompleted(selection.deviceId, stepId, completed, token, signal);
    if (live(g, signal)) useConstructionStore.setState({ progress, status: "ready" });
   } catch (error) { if (live(g, signal)) useConstructionStore.setState({ status: "error", error: error instanceof Error ? error.message : "No se pudo guardar el progreso. Recarga para confirmar el estado." }); }
  },
  reload: reset,
  stop() { stopped = true; controller.abort(); unsubscribe(); useConstructionStore.setState({ generation: -1, progress: null, status: "pending", error: null }); },
 };
}
