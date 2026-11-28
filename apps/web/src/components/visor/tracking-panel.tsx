"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Tile } from "@/components/visor/tile";
import { downloadText } from "@/lib/telemetry/csv";
import { useTelemetryStore, type Reading } from "@/lib/telemetry/store";
import { openTrackingFeed, TRACKING_CONFIG, TRACKING_FEED_OPTIONS } from "@/lib/telemetry/tracking-demo";
import { ingestTracking, initialTrackingState, type TrackingStatus } from "@/lib/telemetry/tracking";
import {
  trajectoryStats,
  trajectoryToCsv,
  trajectoryToGeoJson,
} from "@/lib/telemetry/trajectory";

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
  const trajectory = useTelemetryStore((s) => s.trajectory);
  const trajectoryActive = useTelemetryStore((s) => s.trajectoryActive);
  const replayIndex = useTelemetryStore((s) => s.replayIndex);
  const startTrajectory = useTelemetryStore((s) => s.startTrajectory);
  const stopTrajectory = useTelemetryStore((s) => s.stopTrajectory);
  const clearTrajectory = useTelemetryStore((s) => s.clearTrajectory);
  const setReplayIndex = useTelemetryStore((s) => s.setReplayIndex);

  useEffect(() => () => void feedRef.current?.close(), []);

  const points = trajectory.points;
  const stats = trajectoryStats(trajectory);
  const replayed = replayIndex === null ? points.at(-1) : points[replayIndex];

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
      stopTrajectory();
      setActive(false);
      return;
    }
    await useTelemetryStore.getState().disconnect();
    startTrajectory();
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

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3 text-sm">
        <button
          type="button"
          onClick={trajectoryActive ? stopTrajectory : startTrajectory}
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {trajectoryActive ? "Detener registro" : "Iniciar registro"}
        </button>
        <button
          type="button"
          onClick={clearTrajectory}
          disabled={points.length === 0}
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Limpiar
        </button>
        <span>
          Puntos: <strong className={metric}>{stats.pointCount}</strong>
        </span>
        <span>
          Distancia:{" "}
          <strong className={metric}>{Math.round(stats.distanceM)} m</strong>
        </span>
        <span>
          Duración:{" "}
          <strong className={metric}>{(stats.durationMs / 1000).toFixed(1)} s</strong>
        </span>
        <span>
          Velocidad media:{" "}
          <strong className={metric}>{stats.avgSpeedKmh.toFixed(1)} km/h</strong>
        </span>
        <button
          type="button"
          disabled={points.length === 0}
          onClick={() =>
            downloadText(
              `cubeos-trayectoria-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.csv`,
              trajectoryToCsv(points),
              "text/csv",
            )
          }
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          CSV
        </button>
        <button
          type="button"
          disabled={points.length === 0}
          onClick={() =>
            downloadText(
              `cubeos-trayectoria-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.geojson`,
              trajectoryToGeoJson(points),
              "application/geo+json",
            )
          }
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          GeoJSON
        </button>
      </div>

      {points.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label htmlFor="trajectory-replay">Reproducir</label>
          <input
            id="trajectory-replay"
            type="range"
            min={0}
            max={points.length - 1}
            value={replayIndex ?? points.length - 1}
            onChange={(event) => setReplayIndex(Number(event.target.value))}
            className="w-48 accent-foreground"
          />
          {replayIndex !== null && (
            <button
              type="button"
              onClick={() => setReplayIndex(null)}
              className="underline underline-offset-4"
            >
              Volver al vivo
            </button>
          )}
          {replayed && (
            <span className="font-mono tabular-nums">
              {new Date(replayed.t).toLocaleTimeString()} · {replayed.lat.toFixed(5)}°,{" "}
              {replayed.lon.toFixed(5)}°
            </span>
          )}
        </div>
      )}
    </Tile>
  );
}
