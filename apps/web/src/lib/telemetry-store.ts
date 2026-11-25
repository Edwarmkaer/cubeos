import { create } from "zustand";

import type { ConnectionState, TelemetrySample } from "@cubeos/telemetry";
import { nextSample, seedSample } from "./simulator.ts";

export type TelemetryState = {
  latest: TelemetrySample;
  history: TelemetrySample[];
  connection: ConnectionState;
  tick: () => void;
};

// Única fuente por ahora: DEMO sintética. El adaptador serial llega en un PR posterior.
export const useTelemetryStore = create<TelemetryState>((set) => ({
  latest: seedSample,
  history: [seedSample],
  connection: "simulated",
  tick: () => set((s) => {
    const sample = nextSample(s.latest);
    return { latest: sample, history: [...s.history, sample].slice(-60) };
  }),
}));
