"use client";

import Link from "next/link";

import { SourceStatus } from "@/components/source-status";
import { formatValue } from "@/components/visor/sparkline";
import type { TelemetryChannel } from "@/lib/assembly-guide";
import type { Profile } from "@/lib/telemetry/profile";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { useSource } from "@/lib/telemetry/use-source";

type Row = { label: string; key: string | undefined };

function rowsFor(channel: "actitud" | "ambiente" | "gps", p: Profile): Row[] {
  const byName = (re: RegExp) => p.fields.find((f) => re.test(f.key.split(".").at(-1) ?? f.key))?.key;
  if (channel === "actitud") return [
    { label: "Roll", key: p.attitude?.roll }, { label: "Pitch", key: p.attitude?.pitch }, { label: "Yaw", key: p.attitude?.yaw },
  ];
  if (channel === "gps") return [{ label: "Latitud", key: p.gps?.lat }, { label: "Longitud", key: p.gps?.lon }];
  return [
    { label: "Temperatura", key: byName(/^(temp|temperature)/i) },
    { label: "Humedad", key: byName(/^(hum|humidity|rh)$/i) },
    { label: "UV", key: byName(/^uv/i) },
  ];
}

/** Lecturas en vivo de los sensores que aporta una pieza: une el ensamble con el visor. */
export function PartTelemetry({ channels }: { channels: TelemetryChannel[] }) {
  useSource();
  const profile = useTelemetryStore((s) => s.profiles[s.source]);
  const latest = useTelemetryStore((s) => s.readings.at(-1));

  return (
    <div className="space-y-3">
      {channels.map((channel) => {
        if (channel === "enlace") return <SourceStatus key={channel} className="font-mono text-sm" />;
        if (channel === "camara") return null;
        return (
          <dl key={channel} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            {rowsFor(channel, profile).map((row) => {
              const field = profile.fields.find((f) => f.key === row.key);
              const value = row.key && latest ? latest.values[row.key] : undefined;
              return (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {value === undefined ? "—" : formatValue(value, field?.digits ?? 1)}
                    {field?.unit && <span className="ml-1 text-xs text-muted-foreground">{field.unit}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        );
      })}
      {!latest && (
        <Link href="/conectar" className="block text-sm underline underline-offset-4">Conectar una fuente</Link>
      )}
    </div>
  );
}
