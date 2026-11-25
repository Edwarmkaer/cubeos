import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CustomAssembly = {
  step: number;
  showAll: boolean;
  selected: string | null;
  checked: string[];
  goTo: (step: number, total: number) => void;
  setShowAll: (v: boolean) => void;
  select: (name: string | null) => void;
  toggle: (partId: string) => void;
  reset: () => void;
};

export const useCustomAssembly = create<CustomAssembly>()(
  persist(
    (set) => ({
      step: 0,
      showAll: false,
      selected: null,
      checked: [],
      goTo: (step, total) => set({ step: Math.min(total - 1, Math.max(0, step)), selected: null }),
      setShowAll: (showAll) => set({ showAll }),
      select: (selected) => set({ selected }),
      toggle: (id) => set((s) => ({ checked: s.checked.includes(id) ? s.checked.filter((c) => c !== id) : [...s.checked, id] })),
      reset: () => set({ step: 0, selected: null, checked: [], showAll: false }),
    }),
    {
      name: "cubeos-custom-assembly",
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ step: s.step, checked: s.checked, showAll: s.showAll }),
    },
  ),
);
