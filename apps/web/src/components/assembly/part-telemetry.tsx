"use client";

import Link from "next/link";

import type { TelemetrySample } from "@cubeos/telemetry";

import { formatValue } from "@/components/visor/sparkline";
import type { TelemetryChannel } from "@/lib/assembly-guide";
import { gpsPosition, reading } from "@/lib/real-telemetry";
import { useTelemetry } from "@/lib/use-telemetry";

// En DEMO la muestra simulada trae ángulos, no velocidades: `demoLabel`/`demoUnit` lo dicen.
type Row = { label: string; unit: string; digits: number; real?: string; demo?: keyof TelemetrySample; demoLabel?: string; demoUnit?: string };

const rows: Record<Exclude<TelemetryChannel, "enlace" | "camara">, Row[]> = {
  actitud: [
    { label: "Giro X", unit: "°/s", digits: 1, real: "sensors.mpu6050.angularRateDps.x", demo: "gyro_roll", demoLabel: "Roll", demoUnit: "°" },
    { label: "Giro Y", unit: "°/s", digits: 1, real: "sensors.mpu6050.angularRateDps.y", demo: "gyro_pitch", demoLabel: "Pitch", demoUnit: "°" },
    { label: "Giro Z", unit: "°/s", digits: 1, real: "sensors.mpu6050.angularRateDps.z", demo: "gyro_yaw", demoLabel: "Yaw", demoUnit: "°" },
  ],
  ambiente: [
    { label: "Temperatura", unit: "°C", digits: 1, real: "sensors.bme680.temperatureC", demo: "temperature" },
    { label: "Humedad", unit: "%", digits: 0, real: "sensors.bme680.relativeHumidityPct", demo: "humidity" },
    { label: "Luz UV", unit: "", digits: 1, real: "sensors.guvaS12sd.adcRaw", demo: "uv_index" },
  ],
  gps: [
    { label: "Latitud", unit: "°", digits: 3, demo: "gps_lat" },
    { label: "Longitud", unit: "°", digits: 3, demo: "gps_lon" },
  ],
};

const links: Record<string, string> = {
  pending: "Esperando fuente",
  connecting: "Conectando",
  connected: "Enlace activo",
  reconnecting: "Reconectando",
  unauthorized: "Sin autorización",
  error: "Error de enlace",
  closed: "Enlace cerrado",
  simulated: "Simulado (DEMO)",
};

/** Lecturas en vivo de los sensores que aporta una pieza: une el ensamble con el visor. */
export function PartTelemetry({ channels }: { channels: TelemetryChannel[] }) {
  const { sample, event, now, selection, connection } = useTelemetry();
  const demo = selection.mode === "demo";
  const gps = gpsPosition(event);

  const value = (row: Row) => {
    if (demo) return sample && row.demo ? formatValue(sample[row.demo] as number, row.digits) : "—";
    if (row.demo === "gps_lat" || row.demo === "gps_lon") return gps ? formatValue(gps[row.demo], row.digits) : "—";
    const n = row.real ? reading(event, row.real, now).value : null;
    return n === null ? "—" : formatValue(n, row.digits);
  };

  const noSource = !demo && !(selection.apiURL && selection.deviceId);
  if (noSource)
    return (
      <p className="text-sm text-muted-foreground">
        Sin fuente de datos. Elige DEMO o tu CubeSat en{" "}
        <Link href="/configuracion" className="underline underline-offset-4">
          Configuración
        </Link>{" "}
        para ver sus lecturas aquí.
      </p>
    );

  return (
    <div className="space-y-3">
      {channels.map((channel) => {
        if (channel === "enlace")
          return (
            <p key={channel} className="flex items-center gap-2 font-mono text-sm">
              <span className={`size-2 rounded-full ${connection === "connected" || connection === "simulated" ? "bg-[var(--chart-roll)]" : "bg-muted"}`} />
              {links[connection] ?? connection}
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
                <dt className="text-muted-foreground">{demo ? row.demoLabel ?? row.label : row.label}</dt>
                <dd className="text-right font-mono tabular-nums">
                  {value(row)}
                  <span className="ml-1 text-xs text-muted-foreground">{demo ? row.demoUnit ?? row.unit : row.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        );
      })}
    </div>
  );
}
