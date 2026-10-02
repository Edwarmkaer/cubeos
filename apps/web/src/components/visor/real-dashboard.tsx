"use client";
import Link from "next/link";
import { Tile, PendingNote } from "./tile";
import { BatteryIndicator } from "./battery-indicator";
import { CameraGallery } from "./camera-gallery";
import { TrendChart } from "./trend-chart";
import { TelemetryMap } from "./telemetry-map";
import { formatValue } from "./sparkline";
import { fieldAge, gpsPosition, reading } from "@/lib/real-telemetry";
import type { Reading } from "@/lib/real-telemetry";
import type { TelemetryState } from "@/lib/telemetry-store";

const states = { pending: "Esperando lectura", unverified: "No verificado", current: "", stale: "Antigua", unknown_age: "Antigüedad desconocida", not_installed: "No instalado", unavailable: "Fallo de sensor" };
function Evidence({ r }: { r: Pick<Reading, "state" | "ageSeconds"> }) {
  return <p className="text-[11px] text-muted-foreground">{states[r.state]}{r.ageSeconds !== null ? ` · hace ${r.ageSeconds} s` : ""}</p>;
}
const links = { pending: "API pendiente", connecting: "Conectando API", connected: "API conectada", reconnecting: "Reconectando API", unauthorized: "Sin autorización", error: "Error de API", closed: "API cerrada", simulated: "DEMO" };

export function RealDashboard({ state }: { state: TelemetryState & { now: number } }) {
  const { event, now, readings, positions, selection } = state;
  const r = (path: string) => reading(event, path, now);
  const value = (path: string, digits = 2) => { const n = r(path).value; return n === null ? "—" : formatValue(n, digits); };
  const metric = (path: string, unit: string, digits = 1) => <>
    <p className="font-mono text-2xl tracking-tight">{value(path, digits)}<span className="ml-1 text-sm text-muted-foreground">{unit}</span></p>
    <Evidence r={r(path)} />
    <TrendChart className="mt-auto h-8 w-full text-foreground/50" series={[{ id: path, color: "currentColor", values: (readings[path] ?? []).map(p => p.value) }]} />
  </>;
  const gps = gpsPosition(event);
  const g = event?.snapshot.sensors.gps;
  const axes = ["x", "y", "z"] as const;
  const colors = ["var(--chart-roll)", "var(--chart-pitch)", "var(--chart-yaw)"];
  const angular = axes.map(a => `sensors.mpu6050.angularRateDps.${a}`);
  const s = event?.snapshot;
  return <div className="dashboard-bento">
    <Tile title="Luz" className="[grid-area:luz]">{metric("sensors.bh1750.illuminanceLux", "lx", 0)}</Tile>
    <Tile title="Luz UV" className="[grid-area:luzuv]">
      {metric("sensors.guvaS12sd.adcRaw", "cuentas", 0)}
      <p className="text-xs text-muted-foreground">{value("sensors.guvaS12sd.sensorMv", 0)} mV · sin calibrar</p>
      <Evidence r={r("sensors.guvaS12sd.sensorMv")} />
    </Tile>
    <Tile title="Velocidad angular" className="[grid-area:giro]">
      <dl className="grid grid-cols-3 gap-4 text-center">{angular.map((path, i) => <div key={path} className="min-w-0">
        <dt className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: colors[i] }} aria-hidden />{axes[i].toUpperCase()}</dt>
        <dd className="mt-0.5 font-mono text-lg tabular-nums">{value(path, 3)}<span className="text-xs"> °/s</span></dd><Evidence r={r(path)} />
      </div>)}</dl>
      <TrendChart className="mt-3 min-h-0 w-full flex-1" series={angular.map((path, i) => ({ id: path, color: colors[i], values: (readings[path] ?? []).map(p => p.value) }))} />
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">{axes.map(a => { const path = `sensors.mpu6050.accelerationG.${a}`; return <div key={a}><dt className="text-muted-foreground">Aceleración {a.toUpperCase()}</dt><dd className="font-mono">{value(path, 3)} g</dd><Evidence r={r(path)} /></div>; })}</dl>
    </Tile>
    <Tile title="GPS" className="[grid-area:gps]">
      <TelemetryMap sample={gps} history={positions} offline={selection.offline} />
      <p className="mt-2 shrink-0 font-mono text-sm text-muted-foreground">{gps ? `${formatValue(gps.gps_lat, 7)}°, ${formatValue(gps.gps_lon, 7)}° · ${gps.gps_alt === null ? "—" : formatValue(gps.gps_alt, 2)} m` : g?.status === "not_installed" ? "GPS no instalado" : g?.status === "unavailable" ? "Fallo de GPS" : g?.fix === 1 ? "Calidad de fix desconocida" : "Sin fix válido"}</p>
      <Evidence r={r("sensors.gps.latitudeDeg")} />
      <p className="text-xs text-muted-foreground">{gps ? `${value("sensors.gps.speedMps")} m/s · ${value("sensors.gps.headingDeg")}° · ` : ""}{value("sensors.gps.satellites", 0)} satélites</p>
      {gps ? <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">{[["Lon", "longitudeDeg"], ["Alt", "altitudeM"], ["Vel", "speedMps"], ["Rumbo", "headingDeg"], ["Sat", "satellites"]].map(([label, key]) => <div key={key}>{label}<Evidence r={r(`sensors.gps.${key}`)} /></div>)}</div> : null}
    </Tile>
    <Tile title="Presión" className="[grid-area:presion]">{metric("sensors.bme680.pressurePa", "Pa", 0)}
      <p className="mt-2 text-xs text-muted-foreground">Gas {value("sensors.bme680.gasResistanceOhm", 0)} Ω</p><Evidence r={r("sensors.bme680.gasResistanceOhm")} />
      <p className="text-xs text-muted-foreground">BMP280 {value("sensors.bmp280.pressurePa", 0)} Pa</p><Evidence r={r("sensors.bmp280.pressurePa")} />
    </Tile>
    <Tile title="Temp" className="[grid-area:temp]">{metric("sensors.bme680.temperatureC", "°C", 2)}
      <p className="mt-2 text-xs text-muted-foreground">BMP280 {value("sensors.bmp280.temperatureC")} °C</p><Evidence r={r("sensors.bmp280.temperatureC")} />
      <p className="text-xs text-muted-foreground">TMP102 {value("sensors.tmp102.temperatureC")} °C</p><Evidence r={r("sensors.tmp102.temperatureC")} />
    </Tile>
    <Tile title="Humedad" className="[grid-area:humedad]">{metric("sensors.bme680.relativeHumidityPct", "%", 2)}</Tile>
    <Tile title="Visor 3D" className="[grid-area:visor]"><div className="grid flex-1 place-items-center"><PendingNote>Actitud pendiente de un estimador aprobado.</PendingNote></div></Tile>
    <Tile title="Telemetría" className="[grid-area:telem]">
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-lg">{links[state.connection]}</p>
        <Link href="/configuracion" className="shrink-0 text-xs underline focus-visible:outline-2">Configurar fuente</Link>
      </div>
      <p className="text-xs text-muted-foreground">{selection.mode === "local" ? "API local" : "API pública"} · {selection.deviceName || "Selecciona un dispositivo"}</p>
      <p className="break-all text-[11px] text-muted-foreground">{selection.deviceId}</p>
      <p className="mt-1 text-xs text-muted-foreground">{s ? `Entrega observada · ${s.gateway.id ?? "receptor sin identificación"} · hace ${Math.max(0, Math.floor((now - Date.parse(s.receivedAt)) / 1000))} s` : "Receptor: esperando entrega"}</p>
      <p className="text-xs text-muted-foreground">Enlace de radio desconocido</p>
      <p className="text-xs text-muted-foreground">RSSI {s?.radio.rssiDbm ?? "—"} dBm · SNR {s?.radio.snrDb ?? "—"} dB</p>
      <p className="text-[11px] text-muted-foreground" title={s?.receivedAt}>{event ? `Revisión ${event.revisionId} · ${s?.receivedAt.slice(11, 19)} UTC` : "Esperando primera muestra real"}</p>
      <p className="text-[11px] text-muted-foreground">{s?.health.errors.join(", ") || ""}{s?.health.events?.length ? ` · ${s.health.events.join(", ")}` : ""}</p>
      {state.error ? <p role="alert" className="text-xs text-muted-foreground">{state.error}</p> : null}
      </div>
    </Tile>
    <div className="grid min-h-0 grid-cols-2 gap-3 [grid-area:batteries]">
      <Tile title="CubeSat"><div className="min-h-0 flex-1 overflow-y-auto"><BatteryIndicator voltage={r("power.batteryVoltageV").value ?? undefined} /><Evidence r={r("power.batteryVoltageV")} /><p className="text-center text-[11px] text-muted-foreground">{value("power.batteryCurrentA", 3)} A</p><Evidence r={r("power.batteryCurrentA")} /><p className="text-center text-[11px] text-muted-foreground">{value("power.batteryPowerW", 3)} W</p><Evidence r={r("power.batteryPowerW")} /></div></Tile>
      <Tile title="Paneles"><div className="min-h-0 flex-1 overflow-y-auto"><BatteryIndicator /><PendingNote>Sin medición independiente.</PendingNote></div></Tile>
    </div>
    <Tile title="Cámara" className="[grid-area:camera]">
      <p className="text-xs text-muted-foreground">Estado de cámara: {s?.health.errors.includes("CAMERA_FAILURE") ? "fallo" : s?.payload.cameraOk === null || !s ? "pendiente" : s.payload.cameraOk ? "operativa" : "fallo"} · SD {s?.health.errors.includes("STORAGE_FAILURE") ? "fallo" : s?.payload.sdFreeMb ?? "—"} MB · {s?.payload.deploymentState ?? "despliegue pendiente"}</p>
      {event ? <div className="flex gap-3 text-xs text-muted-foreground"><div>Cámara <Evidence r={fieldAge(event, "payload.cameraOk", now)} /></div><div>SD <Evidence r={fieldAge(event, "payload.sdFreeMb", now)} /></div></div> : null}
      <CameraGallery frames={[]} />
      <p className="text-[11px] text-muted-foreground">Esperando capturas reales · recepción de fotos pendiente.</p>
    </Tile>
  </div>;
}
