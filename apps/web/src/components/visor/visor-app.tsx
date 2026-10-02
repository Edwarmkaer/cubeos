"use client";

import { AppShell } from "@/components/app-shell";
import { DashboardGrid } from "@/components/visor/dashboard-grid";
import { RealDashboard } from "@/components/visor/real-dashboard";
import { useTelemetry } from "@/lib/use-telemetry";

export function VisorApp() {
  const state = useTelemetry();
  const { sample, history, selection } = state;

  return (
    <AppShell>
      <h1 className="sr-only">Visor de telemetría</h1>
      <div
        className="h-full min-w-0 overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label="Paneles de telemetría"
        tabIndex={0}
      >
        {selection.mode === "demo" && sample ? <DashboardGrid sample={sample} history={history} connection="simulated" /> : <RealDashboard state={state} />}
      </div>
    </AppShell>
  );
}
