"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Tile } from "@/components/visor/tile";
import { useTelemetryStore, type Reading } from "@/lib/telemetry/store";
import { openTripFeed, TRIP_FEED_OPTIONS, TRIP_PIPELINE_CONFIG } from "@/lib/telemetry/trip-feed";
import { ingestTrip, initialTripState, type TripStatus } from "@/lib/telemetry/trip-pipeline";

const STATUS_LABEL: Record<TripStatus, string> = {
  sin_datos: "Sin datos",
  en_ruta: "En ruta",
  parado: "Parado",
  en_destino: "En destino",
};

const metric = "font-mono text-sm tabular-nums text-foreground";

export function TripPanel() {
  const [active, setActive] = useState(false);
  const feedRef = useRef<{ close: () => Promise<void> } | null>(null);
  const readings = useTelemetryStore((s) => s.readings);

  useEffect(() => () => void feedRef.current?.close(), []);

  const tripReadings = useMemo(
    () =>
      readings.filter(
        (r: Reading) =>
          TRIP_PIPELINE_CONFIG.seqField in r.values &&
          TRIP_PIPELINE_CONFIG.vehicleField in r.values,
      ),
    [readings],
  );

  const trip = useMemo(
    () =>
      tripReadings.reduce(
        (state, reading) => ingestTrip(state, reading, TRIP_PIPELINE_CONFIG),
        initialTripState(TRIP_PIPELINE_CONFIG),
      ),
    [tripReadings],
  );

  async function toggle() {
    if (active) {
      await feedRef.current?.close();
      feedRef.current = null;
      setActive(false);
      return;
    }
    await useTelemetryStore.getState().disconnect();
    feedRef.current = openTripFeed(
      (line) => useTelemetryStore.getState().ingest(line),
      500,
      TRIP_FEED_OPTIONS,
    );
    setActive(true);
  }

  return (
    <Tile title="Modo Chofex · viaje simulado" className="mb-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <button
          type="button"
          onClick={() => void toggle()}
          className="rounded-md bg-well px-3 py-1 text-sm transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {active ? "Detener viaje" : "Simular viaje"}
        </button>
        <span>
          Estado: <strong className={metric}>{STATUS_LABEL[trip.status]}</strong>
        </span>
        <span>
          Fuente: <strong className={metric}>{trip.source}</strong> ({trip.confidence.toFixed(1)})
        </span>
        <span>
          Aplicados: <strong className={metric}>{trip.applied}</strong>
        </span>
        <span>
          Duplicados: <strong className={metric}>{trip.duplicateCount}</strong>
        </span>
        <span>
          Descartados: <strong className={metric}>{trip.discardedCount}</strong>
        </span>
        <span>
          En espera: <strong className={metric}>{trip.pending.length}</strong>
        </span>
        <span>
          Distancia:{" "}
          <strong className={metric}>
            {trip.distanceToDestinationM === null ? "—" : `${Math.round(trip.distanceToDestinationM)} m`}
          </strong>
        </span>
        <span>
          Velocidad:{" "}
          <strong className={metric}>
            {trip.speedKmh === null ? "—" : `${trip.speedKmh.toFixed(1)} km/h`}
          </strong>
        </span>
        <span>
          ETA: <strong className={metric}>{trip.etaMinutes === null ? "—" : `${trip.etaMinutes.toFixed(1)} min`}</strong>
        </span>
      </div>
    </Tile>
  );
}
