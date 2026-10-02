"use client";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { IconCurrentLocation, IconMapPin } from "@tabler/icons-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

type MapSample = { gps_lat: number; gps_lon: number; gps_alt?: number | null };

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/dark";

type Coordinate = [longitude: number, latitude: number];

function coordinateOf(sample: MapSample | null): Coordinate | null {
  if (!sample) return null;
  const { gps_lat: latitude, gps_lon: longitude } = sample;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [longitude, latitude];
}

export function TelemetryMap({
  sample,
  history,
  offline = false,
}: {
  sample: MapSample | null;
  history: MapSample[];
  offline?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const reducedMotion = useReducedMotion();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [following, setFollowing] = useState(true);
  const current = coordinateOf(sample);
  const trail = useMemo(
    () =>
      history
        .map(coordinateOf)
        .filter((coordinate): coordinate is Coordinate => coordinate !== null),
    [history]
  );

  useEffect(() => {
    if (offline || !containerRef.current || !current) return;
    const initialCoordinate = current;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;

    async function initialize() {
      const maplibre = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: initialCoordinate,
        zoom: 12.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });

      mapRef.current = map;
      map.addControl(
        new maplibre.NavigationControl({ showCompass: false }),
        "top-right"
      );
      map.addControl(new maplibre.AttributionControl({ compact: false }));

      const markerElement = document.createElement("div");
      markerElement.className = "telemetry-map-marker";
      markerElement.setAttribute("aria-hidden", "true");
      markerRef.current = new maplibre.Marker({ element: markerElement })
        .setLngLat(initialCoordinate)
        .addTo(map);

      map.once("style.load", () => {
        if (disposed) return;
        try {
          tuneDarkStyle(map);
          map.addSource("telemetry-track", {
            type: "geojson",
            data: lineFeature(trail),
          });
          map.addLayer({
            id: "telemetry-track",
            type: "line",
            source: "telemetry-track",
            paint: {
              "line-color": "#63c4d5",
              "line-width": 2.5,
              "line-opacity": 0.75,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
          setStatus("ready");
        } catch {
          setStatus("error");
        }
      });
      map.once("error", () => {
        if (!map.loaded()) setStatus("error");
      });
      map.on("dragstart", () => setFollowing(false));

      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
    }

    void initialize().catch(() => setStatus("error"));

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map instance is created once for the first valid GPS position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(current), offline]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !current) return;

    markerRef.current?.setLngLat(current);
    const source = map.getSource("telemetry-track") as
      | GeoJSONSource
      | undefined;
    source?.setData(lineFeature(trail));

    if (following && status === "ready") {
      map.easeTo({
        center: current,
        duration: reducedMotion ? 0 : 220,
      });
    }
  }, [current, following, reducedMotion, status, trail]);

  function resumeFollowing() {
    setFollowing(true);
    if (current) {
      mapRef.current?.easeTo({
        center: current,
        duration: reducedMotion ? 0 : 220,
      });
    }
  }

  if (!current || offline) {
    return (
      <div className="grid min-h-32 flex-1 place-items-center rounded-sm bg-background/55 px-6 text-center">
        <div>
          <IconMapPin className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {!current ? "Esperando coordenadas GPS" : "Modo sin Internet · mapa base desactivado"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-32 flex-1 overflow-hidden rounded-sm bg-background/55">
      <div ref={containerRef} className="telemetry-map-canvas" aria-hidden />

      {status !== "ready" ? (
        <div className="absolute inset-0 grid place-items-center bg-well/85 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            {status === "error"
              ? "No se pudo cargar el mapa base"
              : "Cargando mapa…"}
          </p>
        </div>
      ) : null}

      {!following && status === "ready" ? (
        <button
          type="button"
          onClick={resumeFollowing}
          className="absolute left-2 top-2 flex h-8 items-center gap-1.5 rounded-md bg-well/90 px-2.5 text-xs text-foreground shadow-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <IconCurrentLocation className="size-4" aria-hidden />
          Seguir CubeSat
        </button>
      ) : null}
    </div>
  );
}

function lineFeature(coordinates: Coordinate[]) {
  const lineCoordinates =
    coordinates.length === 1
      ? [coordinates[0], coordinates[0]]
      : coordinates;

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: lineCoordinates,
    },
  };
}

function tuneDarkStyle(map: MapLibreMap) {
  type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];
  const colors: Array<[string, PaintProperty, string]> = [
    ["background", "background-color", "#080b11"],
    ["water", "fill-color", "#0b1922"],
    ["landuse_park", "fill-color", "#111b18"],
    ["landcover_wood", "fill-color", "#101815"],
    ["building", "fill-color", "#121820"],
    ["building", "fill-outline-color", "#1b2730"],
    ["waterway", "line-color", "#183342"],
    ["highway_path", "line-color", "#202a32"],
    ["highway_minor", "line-color", "#25313a"],
    ["highway_major_subtle", "line-color", "#2d3b46"],
    ["highway_major_inner", "line-color", "#344550"],
    ["highway_motorway_inner", "line-color", "#415864"],
    ["highway_name_other", "text-color", "#7f8b96"],
    ["highway_name_motorway", "text-color", "#98a5af"],
    ["place_suburb", "text-color", "#8c98a2"],
    ["place_city", "text-color", "#b4bec7"],
    ["place_city_large", "text-color", "#d1d7dd"],
  ];

  for (const [layer, property, color] of colors) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, color);
  }
}
