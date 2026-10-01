import { create } from "zustand";

import type { ConnectionState, TelemetrySample } from "@cubeos/telemetry";

import { seedSample } from "@/lib/simulator";

const HISTORY_LIMIT = 60;

type TelemetryState = {
  latest: TelemetrySample;
  history: TelemetrySample[];
  connection: ConnectionState;
  push: (sample: TelemetrySample) => void;
  setConnection: (connection: ConnectionState) => void;
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  latest: seedSample,
  history: [seedSample],
  connection: "simulated",
  push: (sample) =>
    set((state) => ({
      latest: sample,
      history: [...state.history, sample].slice(-HISTORY_LIMIT),
    })),
  setConnection: (connection) => set({ connection }),
}));
