"use client";

import { StationDock } from "@/components/station-dock";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 shrink-0 gap-0 overflow-hidden px-3 pb-3 md:gap-3">
      <aside className="relative w-0 shrink-0 md:w-20">
        <StationDock />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </main>
  );
}
