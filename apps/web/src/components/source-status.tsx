"use client";

import { useTelemetryStore } from "@/lib/telemetry/store";
import { cn } from "@/lib/utils";

const copy = {
  idle: { label: "Sin fuente", tone: "bg-muted-foreground" },
  connecting: { label: "Conectando", tone: "bg-[var(--chart-yaw)]" },
  live: { label: "En vivo", tone: "bg-[var(--chart-roll)]" },
  error: { label: "Error", tone: "bg-destructive" },
} as const;

export function SourceStatus({ className }: { className?: string }) {
  const source = useTelemetryStore((s) => s.source);
  const status = useTelemetryStore((s) => s.status);
  const c = copy[status];
  const label = status === "live" ? (source === "demo" ? "DEMO · sintética" : "USB · en vivo") : c.label;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", c.tone, status === "live" && "animate-pulse")} />
      {label}
    </span>
  );
}
