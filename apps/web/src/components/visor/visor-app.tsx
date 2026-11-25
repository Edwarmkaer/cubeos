"use client";

import Link from "next/link";
import { Circle, Download, Square } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AttitudeCube } from "@/components/visor/attitude-cube";
import { OrientationChart } from "@/components/visor/orientation-chart";
import { Sparkline, formatValue } from "@/components/visor/sparkline";
import { TelemetryMap } from "@/components/visor/telemetry-map";
import { Tile } from "@/components/visor/tile";
import { downloadText, readingsToCsv } from "@/lib/telemetry/csv";
import { readingRate, useTelemetryStore } from "@/lib/telemetry/store";
import { useSource } from "@/lib/telemetry/use-source";
import { cn } from "@/lib/utils";

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-well px-3 text-sm transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline focus-visible:outline-2";

function Toolbar() {
  const readings = useTelemetryStore((s) => s.readings);
  const recording = useTelemetryStore((s) => s.recording);
  const recorded = useTelemetryStore((s) => s.recorded);
  const setRecording = useTelemetryStore((s) => s.setRecording);
  const name = useTelemetryStore((s) => s.profiles[s.source].name);
  const rate = readingRate(readings);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pb-3">
      <p className="font-medium">{name}</p>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {rate ? `${rate.toFixed(1)} Hz` : "—"} · {readings.length} en memoria
      </p>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={button} onClick={() => setRecording(!recording)}>
          {recording ? <Square className="size-3.5" /> : <Circle className="size-3.5 fill-destructive text-destructive" />}
          {recording ? `Detener (${recorded.length})` : "Grabar"}
        </button>
        <button
          type="button"
          className={button}
          disabled={recorded.length === 0}
          onClick={() => downloadText(`cubeos-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.csv`, readingsToCsv(recorded), "text/csv")}
        >
          <Download className="size-3.5" />
          CSV
        </button>
      </div>
    </div>
  );
}

function Empty() {
  const status = useTelemetryStore((s) => s.status);
  const error = useTelemetryStore((s) => s.error);
  return (
    <div className="grid h-full place-items-center rounded-md bg-well p-6 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-medium">{status === "live" || status === "connecting" ? "Esperando datos…" : "Sin fuente conectada"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? (status === "live" ? "La placa está conectada pero aún no envía líneas válidas." : "Conecta una placa por USB o usa la DEMO.")}
        </p>
        <Link href="/conectar" className="mt-4 inline-block underline underline-offset-4">
          Ir a Conectar
        </Link>
      </div>
    </div>
  );
}

export function VisorApp() {
  useSource();
  const readings = useTelemetryStore((s) => s.readings);
  const profile = useTelemetryStore((s) => s.profiles[s.source]);
  const latest = readings.at(-1);

  const series = (key: string) => readings.map((r) => r.values[key]).filter((v): v is number => v !== undefined);
  const att = profile.attitude;
  const gps = profile.gps;
  const attValue = att && latest && [att.roll, att.pitch, att.yaw].every((k) => k in latest.values)
    ? { roll: latest.values[att.roll], pitch: latest.values[att.pitch], yaw: latest.values[att.yaw] }
    : null;
  const attHistory = att
    ? readings.filter((r) => att.roll in r.values).map((r) => ({ roll: r.values[att.roll], pitch: r.values[att.pitch] ?? 0, yaw: r.values[att.yaw] ?? 0 }))
    : [];
  const gpsSamples = gps
    ? readings.filter((r) => gps.lat in r.values && gps.lon in r.values).map((r) => ({ gps_lat: r.values[gps.lat], gps_lon: r.values[gps.lon] }))
    : [];
  // Los campos que ya dibujan la orientación o el mapa no se repiten como tarjetas.
  const shown = new Set([...(attValue && att ? [att.roll, att.pitch, att.yaw] : []), ...(gpsSamples.length && gps ? [gps.lat, gps.lon] : [])]);
  const metrics = profile.fields.filter((f) => f.visible && latest && f.key in latest.values && !shown.has(f.key));

  return (
    <AppShell>
      <h1 className="sr-only">Visor de telemetría</h1>
      <Toolbar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!latest ? (
          <Empty />
        ) : (
          <div className="grid auto-rows-[9.5rem] grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attValue && (
              <Tile title="Orientación" className="row-span-2 sm:col-span-2">
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <AttitudeCube {...attValue} className="hidden md:grid" />
                  <OrientationChart value={attValue} history={attHistory} />
                </div>
              </Tile>
            )}
            {gpsSamples.length > 0 && (
              <Tile title="Posición" className="row-span-2 sm:col-span-2">
                <TelemetryMap sample={gpsSamples.at(-1)!} history={gpsSamples} />
                <p className="mt-2 shrink-0 font-mono text-sm text-muted-foreground">
                  {formatValue(gpsSamples.at(-1)!.gps_lat, 5)}°, {formatValue(gpsSamples.at(-1)!.gps_lon, 5)}°
                </p>
              </Tile>
            )}
            {metrics.map((f) => (
              <Tile key={f.key} title={f.label}>
                <p className="font-mono text-2xl tracking-tight tabular-nums">
                  {formatValue(latest.values[f.key], f.digits)}
                  {f.unit && <span className="ml-1 text-sm text-muted-foreground">{f.unit}</span>}
                </p>
                <Sparkline className={cn("mt-auto h-10 w-full text-foreground/50")} values={series(f.key)} />
              </Tile>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
