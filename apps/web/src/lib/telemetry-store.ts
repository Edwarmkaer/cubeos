import { create } from "zustand";

import type { TelemetrySample } from "@cubeos/telemetry";
import type { SnapshotEvent, ConnectionState as APIConnection } from "@cubeos/api-client";
import { seedSample } from "./simulator.ts";
import { appendReadings, gpsPosition } from "./real-telemetry.ts";
import type { ReadingHistory } from "./real-telemetry.ts";

export type SourceSelection = { mode: "demo" | "local" | "public"; apiURL: string; deviceId: string; deviceName: string; offline: boolean };
export type LinkState = APIConnection | "pending" | "simulated";
export type TelemetryState = {
  selection: SourceSelection; generation: number; event: SnapshotEvent | null;
  readings: ReadingHistory; positions: NonNullable<ReturnType<typeof gpsPosition>>[];
  latest: TelemetrySample | null; history: TelemetrySample[]; connection: LinkState; error: string | null;
  select: (selection: SourceSelection) => void;
  accept: (event: SnapshotEvent, generation: number) => void;
  push: (sample: TelemetrySample, generation: number) => void;
  setConnection: (state: LinkState, generation: number) => void;
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  selection: { mode: "local", apiURL: "", deviceId: "", deviceName: "", offline: true },
  generation: 0, event: null, readings: {}, positions: [], latest: null, history: [], connection: "pending", error: null,
  select: selection => set(s => ({ selection, generation: s.generation + 1, event: null, readings: {}, positions: [],
    latest: selection.mode === "demo" ? seedSample : null, history: selection.mode === "demo" ? [seedSample] : [],
    connection: selection.mode === "demo" ? "simulated" : "pending", error: null })),
  accept: (event, generation) => set(s => {
    if (generation !== s.generation || s.selection.mode === "demo" || (s.event && BigInt(event.revisionId) <= BigInt(s.event.revisionId))) return s;
    const p = gpsPosition(event); const old = s.event && gpsPosition(s.event);
    const changed = p && (!old || p.gps_lat !== old.gps_lat || p.gps_lon !== old.gps_lon || p.gps_alt !== old.gps_alt);
    return { event, readings: appendReadings(s.readings, event), positions: changed ? [...s.positions, p].slice(-60) : s.positions };
  }),
  push: (sample, generation) => set(s => generation === s.generation && s.selection.mode === "demo" ? { latest: sample, history: [...s.history, sample].slice(-60) } : s),
  setConnection: (connection, generation) => set(s => generation === s.generation ? { connection } : s),
}));
