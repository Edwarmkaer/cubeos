"use client";

import { useSyncExternalStore } from "react";

import { CustomAssembly } from "@/components/assembly/custom-assembly";
import { ConstructionView } from "@/components/construction-view";
import { cn } from "@/lib/utils";

type Tab = "ejemplo" | "propio";
const KEY = "cubeos-assembly-tab";

const listeners = new Set<() => void>();
const read = (): Tab => {
  try {
    return localStorage.getItem(KEY) === "propio" ? "propio" : "ejemplo";
  } catch {
    return "ejemplo";
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function AssemblyPage() {
  const tab = useSyncExternalStore(subscribe, read, () => "ejemplo" as Tab);
  const pick = (t: Tab) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    listeners.forEach((fn) => fn());
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Proyecto de armado" className="mb-3 flex shrink-0 gap-1 self-start rounded-md bg-well p-1 text-sm">
        {([["ejemplo", "Ejemplo · CubeSat 1U"], ["propio", "Mi proyecto"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => pick(id)}
            className={cn("h-8 rounded px-3", tab === id ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "ejemplo" ? <ConstructionView /> : <CustomAssembly />}</div>
    </div>
  );
}
