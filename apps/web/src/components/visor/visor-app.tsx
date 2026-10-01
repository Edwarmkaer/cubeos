"use client";

import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/visor/dashboard-grid";
import { useTelemetry } from "@/lib/use-telemetry";

export function VisorApp() {
  const { sample, history, connection } = useTelemetry();

  return (
    <AppShell>
      <h1 className="sr-only">Visor de telemetría</h1>
      <div
        className="h-full min-w-0 overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label="Paneles de telemetría"
        tabIndex={0}
      >
        <DashboardGrid
          sample={sample}
          history={history}
          connection={connection}
        />
      </div>
    </AppShell>
  );
}
