"use client";

import Link from "next/link";

import type { TelemetrySample } from "@cubeos/telemetry";

import { formatValue } from "@/components/visor/sparkline";
import type { TelemetryChannel } from "@/lib/assembly-guide";
import { useTelemetry } from "@/lib/use-telemetry";

type Row = { label: string; unit: string; digits: number; key: keyof TelemetrySample };

const rows: Record<Exclude<TelemetryChannel, "enlace" | "camara">, Row[]> = {
  actitud: [
    { label: "Roll", unit: "°", digits: 1, key: "gyro_roll" },
    { label: "Pitch", unit: "°", digits: 1, key: "gyro_pitch" },
    { label: "Yaw", unit: "°", digits: 1, key: "gyro_yaw" },
  ],
  ambiente: [
    { label: "Temperatura", unit: "°C", digits: 1, key: "temperature" },
    { label: "Humedad", unit: "%", digits: 0, key: "humidity" },
    { label: "Luz UV", unit: "", digits: 1, key: "uv_index" },
  ],
  gps: [
    { label: "Latitud", unit: "°", digits: 3, key: "gps_lat" },
    { label: "Longitud", unit: "°", digits: 3, key: "gps_lon" },
  ],
};

/** Lecturas en vivo de los sensores que aporta una pieza: une el ensamble con el visor. */
export function PartTelemetry({ channels }: { channels: TelemetryChannel[] }) {
  const { sample } = useTelemetry();

  return (
    <div className="space-y-3">
      {channels.map((channel) => {
        if (channel === "enlace")
          return (
            <p key={channel} className="flex items-center gap-2 font-mono text-sm">
              <span className="size-2 rounded-full bg-[var(--chart-roll)]" />
              Simulado (DEMO)
            </p>
          );
        if (channel === "camara")
          return (
            <Link key={channel} href="/visor" className="text-sm underline underline-offset-4">
              Ver capturas en el Visor
            </Link>
          );
        return (
          <dl key={channel} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            {rows[channel].map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right font-mono tabular-nums">
                  {formatValue(sample[row.key] as number, row.digits)}
                  <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        );
      })}
    </div>
  );
}
