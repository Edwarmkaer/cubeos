import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { assemblySteps } from "./assembly-guide.ts";
import type { PartId } from "./assembly-guide.ts";

export type AssemblyMode = "armar" | "explosionada";

type AssemblyState = {
  mode: AssemblyMode;
  step: number;
  explode: number;
  selected: PartId | null;
  hovered: PartId | null;
  setMode: (mode: AssemblyMode) => void;
  goTo: (step: number) => void;
  setExplode: (value: number) => void;
  select: (part: PartId | null) => void;
  hover: (part: PartId | null) => void;
  reset: () => void;
};

const last = assemblySteps.length - 1;
const clamp = (step: number) => Math.min(last, Math.max(0, step));

export const useAssemblyStore = create<AssemblyState>()(
  persist(
    (set) => ({
      mode: "armar",
      step: 0,
      explode: 0.7,
      selected: null,
      hovered: null,
      setMode: (mode) => set({ mode, selected: null }),
      goTo: (step) => set({ step: clamp(step), selected: null }),
      setExplode: (explode) => set({ explode }),
      select: (selected) => set({ selected }),
      hover: (hovered) => set({ hovered }),
      reset: () => set({ step: 0, selected: null }),
    }),
    {
      name: "cubeos-assembly",
      // Se rehidrata tras montar para que el HTML del servidor y el primer render coincidan.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode, step: s.step, explode: s.explode }),
    },
  ),
);
