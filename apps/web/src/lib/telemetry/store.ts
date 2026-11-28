import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { openDemo } from "./demo.ts";
import { parseLine } from "./parse.ts";
import { demoProfile, emptyProfile, mergeKeys } from "./profile.ts";
import type { FieldConfig, Profile } from "./profile.ts";
import { openSerial } from "./serial.ts";
import type { LineSource } from "./serial.ts";
import { ingestTrajectory, initialTrajectoryState, type TrajectoryState } from "./trajectory.ts";

export type SourceKind = "demo" | "serial";
export type SourceStatus = "idle" | "connecting" | "live" | "error";
export type Reading = { t: number; values: Record<string, number> };

const HISTORY = 120;
const LINES = 30;
const MAX_RECORDING = 100_000;

type State = {
  source: SourceKind;
  status: SourceStatus;
  error: string | null;
  profiles: Record<SourceKind, Profile>;
  readings: Reading[];
  lines: string[];
  lineCount: number;
  recording: boolean;
  recorded: Reading[];
  trajectory: TrajectoryState;
  trajectoryActive: boolean;
  replayIndex: number | null;
  startTrajectory: () => void;
  stopTrajectory: () => void;
  clearTrajectory: () => void;
  setReplayIndex: (index: number | null) => void;
  connect: (source: SourceKind) => Promise<void>;
  disconnect: () => Promise<void>;
  select: (source: SourceKind) => Promise<void>;
  ingest: (line: string) => void;
  setProfile: (source: SourceKind, profile: Profile) => void;
  updateField: (key: string, patch: Partial<FieldConfig>) => void;
  setRecording: (on: boolean) => void;
};

let active: LineSource | null = null;
let generation = 0;

export const useTelemetryStore = create<State>()(
  persist(
    (set, get) => ({
      source: "demo",
      status: "idle",
      error: null,
      profiles: { demo: demoProfile, serial: emptyProfile() },
      readings: [],
      lines: [],
      lineCount: 0,
      recording: false,
      recorded: [],
      trajectory: initialTrajectoryState(),
      trajectoryActive: false,
      replayIndex: null,

      startTrajectory: () =>
        set({ trajectoryActive: true, trajectory: initialTrajectoryState(), replayIndex: null }),
      stopTrajectory: () => set({ trajectoryActive: false, replayIndex: null }),
      clearTrajectory: () =>
        set({ trajectory: initialTrajectoryState(), replayIndex: null }),
      setReplayIndex: (replayIndex) => set({ replayIndex }),

      connect: async (source) => {
        await get().disconnect();
        const g = ++generation;
        set({ source, status: "connecting", error: null, readings: [], lines: [], lineCount: 0 });
        const onLine = (line: string) => g === generation && get().ingest(line);
        try {
          const opened =
            source === "demo"
              ? openDemo(onLine)
              : await openSerial(get().profiles.serial.baudRate, onLine, (error) => {
                  if (g !== generation) return;
                  active = null;
                  set({ status: error ? "error" : "idle", error: error?.message ?? null });
                });
          if (g !== generation) return void opened.close();
          active = opened;
          set({ status: "live" });
        } catch (error) {
          if (g !== generation) return;
          const cancelled = error instanceof DOMException && error.name === "NotFoundError";
          set({ status: cancelled ? "idle" : "error", error: cancelled ? null : error instanceof Error ? error.message : String(error) });
        }
      },

      disconnect: async () => {
        generation++;
        const current = active;
        active = null;
        set({ status: "idle" });
        await current?.close();
      },

      select: async (source) => {
        await get().disconnect();
        set({ source, error: null, readings: [], lines: [], lineCount: 0 });
      },

      ingest: (line) => {
        const { source, profiles, readings, lines, lineCount, recording, recorded, trajectoryActive } = get();
        const profile = profiles[source];
        const parsed = parseLine(line, profile.format, profile.csvColumns);
        const nextLines = [...lines, line].slice(-LINES);
        if (parsed.kind === "header") {
          set({ lines: nextLines, lineCount: lineCount + 1, profiles: { ...profiles, [source]: { ...profile, csvColumns: parsed.columns } } });
          return;
        }
        if (parsed.kind === "skip") return set({ lines: nextLines, lineCount: lineCount + 1 });
        const reading = { t: Date.now(), values: parsed.values };
        const merged = mergeKeys(profile, Object.keys(parsed.values));
        const trajectory = trajectoryActive ? ingestTrajectory(get().trajectory, reading) : get().trajectory;
        set({
          lines: nextLines,
          lineCount: lineCount + 1,
          readings: [...readings, reading].slice(-HISTORY),
          recorded: recording && recorded.length < MAX_RECORDING ? [...recorded, reading] : recorded,
          trajectory,
          ...(merged !== profile ? { profiles: { ...profiles, [source]: merged } } : {}),
        });
      },

      setProfile: (source, profile) => set((s) => ({ profiles: { ...s.profiles, [source]: profile } })),

      updateField: (key, patch) =>
        set((s) => {
          const p = s.profiles[s.source];
          return { profiles: { ...s.profiles, [s.source]: { ...p, fields: p.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) } } };
        }),

      setRecording: (on) => set({ recording: on, ...(on ? { recorded: [] } : {}) }),
    }),
    {
      name: "cubeos-telemetry",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ profiles: s.profiles }),
    },
  ),
);

/** Frecuencia aproximada (Hz) a partir de las últimas lecturas. */
export function readingRate(readings: Reading[]) {
  const last = readings.slice(-10);
  if (last.length < 2) return 0;
  const span = (last.at(-1)!.t - last[0].t) / 1000;
  return span > 0 ? (last.length - 1) / span : 0;
}
