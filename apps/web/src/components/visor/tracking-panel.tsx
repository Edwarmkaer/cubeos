"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Tile } from "@/components/visor/tile";
import { useTelemetryStore, type Reading } from "@/lib/telemetry/store";
import { openTrackingFeed, TRACKING_CONFIG, TRACKING_FEED_OPTIONS } from "@/lib/telemetry/tracking-demo";
import { ingestTracking, initialTrackingState, type TrackingStatus } from "@/lib/telemetry/tracking";

const STATUS_LABEL: Record<TrackingStatus, string> = {
  sin_datos: "Sin datos",
  siguiendo: "Siguiendo",
  sin_movimiento: "Sin movimiento",
  fuera_de_zona: "Fuera de zona",
};

const metric = "font-mono text-sm tabular-nums text-foreground";

export function TrackingPanel() {
  const [active, setActive] = useState(false);
  const feedRef = useRef<{ close: () => Promise<void> } | null>(null);
  const readings = useTelemetryStore((s) => s.readings);

  useEffect(() => () => void feedRef.current?.close(), []);

  const tracked = useMemo(
    () =>
      readings.filter(
        (r: Reading) =>
          TRACKING_CONFIG.projectField in r.values && TRACKING_CONFIG.seqField in r.values,
      ),
    [readings],
  );

  const tracking = useMemo(
    () =>
      tracked.reduce(
        (state, reading) => ingestTracking(state, reading, TRACKING_CONFIG),
        initialTrackingState(TRACKING_CONFIG),
      ),
    [tracked],
  );

  async function toggle() {
    if (active) {
      await feedRef.current?.close();
      feedRef.current = null;
      setActive(false);
      return;
    }
    await useTelemetryStore.getState().disconnect();
    feedRef.current = openTrackingFeed(
      (line) => useTelemetryStore.getState().ingest(line),
      500,
      TRACKING_FEED_OPTIONS,
    );
    setActive(true);
  }

  const zoneLabel = tracking.insideZone === null ? "—" : tracking.insideZone ? "En zona" : "Fuera";

  return (
    <Tile title="Seguimiento de proyectos" className="mb-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <button
          type="button"
          onClick={() => void toggle()}
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {active ? "Detener DEMO" : "Simular placa"}
        </button>
        <span>
          Proyecto: <strong className={metric}>{tracking.projectId ?? "—"}</strong>
        </span>
        <span>
          Estado: <strong className={metric}>{STATUS_LABEL[tracking.status]}</strong>
        </span>
        <span>
          Zona: <strong className={metric}>{zoneLabel}</strong>
        </span>
        <span>
          Distancia:{" "}
          <strong className={metric}>
            {tracking.distanceToZoneM === null
              ? "—"
              : `${Math.round(tracking.distanceToZoneM)} m`}
          </strong>
        </span>
        <span>
          Velocidad:{" "}
          <strong className={metric}>
            {tracking.speedKmh === null ? "—" : `${tracking.speedKmh.toFixed(1)} km/h`}
          </strong>
        </span>
        <span>
          Aplicadas: <strong className={metric}>{tracking.applied}</strong>
        </span>
        <span>
          Duplicadas: <strong className={metric}>{tracking.duplicateCount}</strong>
        </span>
        <span>
          Tardías: <strong className={metric}>{tracking.lateCount}</strong>
        </span>
        <span>
          Descartadas: <strong className={metric}>{tracking.discardedCount}</strong>
        </span>
        <span>
          En espera: <strong className={metric}>{tracking.pending.length}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Una placa con GPS: campos <code>project_id</code>, <code>seq</code>, <code>lat</code> y{" "}
        <code>lon</code>. También funciona con lecturas seriales que traigan esos campos.
      </p>
    </Tile>
  );
}
