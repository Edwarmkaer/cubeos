"use client";

import type { ConnectionState, TelemetrySample } from "@cubeos/telemetry";

import { AttitudeCube } from "@/components/visor/attitude-cube";
import { BatteryIndicator } from "@/components/visor/battery-indicator";
import { cameraDemoFrames } from "@/components/visor/camera-demo";
import { CameraGallery } from "@/components/visor/camera-gallery";
import { OrientationChart } from "@/components/visor/orientation-chart";
import { Sparkline, formatValue } from "@/components/visor/sparkline";
import { TelemetryMap } from "@/components/visor/telemetry-map";
import { PendingNote, Tile } from "@/components/visor/tile";

function Metric({
  value,
  unit,
  series,
  digits = 1,
}: {
  value: number;
  unit: string;
  series: number[];
  digits?: number;
}) {
  return (
    <>
      <p className="font-mono text-2xl tracking-tight">
        {formatValue(value, digits)}
        <span className="ml-1 text-sm text-muted-foreground">{unit}</span>
      </p>
      <Sparkline
        className="mt-auto h-8 w-full text-foreground/50"
        values={series}
      />
    </>
  );
}

export function DashboardGrid({
  sample,
  history,
  connection,
}: {
  sample: TelemetrySample;
  history: TelemetrySample[];
  connection: ConnectionState;
}) {
  return (
    <div className="dashboard-bento">
      <Tile title="Luz" className="[grid-area:luz]">
        <PendingNote>Fuera del contrato de muestra.</PendingNote>
      </Tile>
      <Tile title="Luz UV" className="[grid-area:luzuv]">
        <Metric
          value={sample.uv_index}
          unit=""
          digits={1}
          series={history.map((row) => row.uv_index)}
        />
      </Tile>
      <Tile title="Giro y orientación" className="[grid-area:giro]">
        <OrientationChart sample={sample} history={history} />
      </Tile>
      <Tile title="GPS" className="[grid-area:gps]">
        <TelemetryMap sample={sample} history={history} />
        <p className="mt-2 shrink-0 font-mono text-sm text-muted-foreground">
          {formatValue(sample.gps_lat, 3)}°, {formatValue(sample.gps_lon, 3)}°,{" "}
          {formatValue(sample.gps_alt, 1)} km
        </p>
      </Tile>

      <Tile title="Presión" className="[grid-area:presion]">
        <PendingNote>Fuera del contrato de muestra.</PendingNote>
      </Tile>
      <Tile title="Temp" className="[grid-area:temp]">
        <Metric
          value={sample.temperature}
          unit="°C"
          series={history.map((row) => row.temperature)}
        />
      </Tile>
      <Tile title="Humedad" className="[grid-area:humedad]">
        <Metric
          value={sample.humidity}
          unit="%"
          series={history.map((row) => row.humidity)}
        />
      </Tile>

      <Tile title="Visor 3D" className="[grid-area:visor]">
        <AttitudeCube
          large
          roll={sample.gyro_roll}
          pitch={sample.gyro_pitch}
          yaw={sample.gyro_yaw}
        />
      </Tile>
      <Tile title="Telemetría" className="[grid-area:telem]">
        <ConnectionPanel
          connection={connection}
          sample={sample}
          sampleCount={history.length}
        />
      </Tile>
      <div className="grid min-h-0 grid-cols-2 gap-3 [grid-area:batteries]">
        <Tile title="CubeSat">
          <BatteryIndicator voltage={7.62} levelPercent={72} demo />
        </Tile>
        <Tile title="Paneles">
          <BatteryIndicator voltage={5.11} levelPercent={48} demo />
        </Tile>
      </div>
      <Tile title="Cámara" className="[grid-area:camera]">
        <CameraGallery frames={cameraDemoFrames} />
      </Tile>
    </div>
  );
}

const connectionCopy: Record<
  ConnectionState,
  { label: string; detail: string; tone: string }
> = {
  simulated: {
    label: "Simulado",
    detail: "Fuente local de desarrollo",
    tone: "bg-[var(--chart-yaw)]",
  },
  connecting: {
    label: "Conectando",
    detail: "Enlazando con estación terrena",
    tone: "bg-[var(--chart-yaw)]",
  },
  connected: {
    label: "Conectado",
    detail: "Estación terrena enlazada",
    tone: "bg-[var(--chart-roll)]",
  },
  disconnected: {
    label: "Desconectado",
    detail: "Sin enlace con estación terrena",
    tone: "bg-muted-foreground",
  },
  error: {
    label: "Error",
    detail: "Fallo de conexión",
    tone: "bg-destructive",
  },
};

function ConnectionPanel({
  connection,
  sample,
  sampleCount,
}: {
  connection: ConnectionState;
  sample: TelemetrySample;
  sampleCount: number;
}) {
  const copy = connectionCopy[connection];
  const sampleTime = sample.timestamp.slice(11, 19);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${copy.tone}`} aria-hidden />
        <p className="font-mono text-xl tabular-nums">{copy.label}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{copy.detail}</p>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Frecuencia</dt>
          <dd className="mt-0.5 font-mono tabular-nums">2 Hz</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última muestra</dt>
          <dd className="mt-0.5 font-mono tabular-nums">{sampleTime} UTC</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {sampleCount} muestras en memoria
      </p>
    </div>
  );
}
