"use client";

import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";

import { Tile } from "@/components/visor/tile";
import { downloadText } from "@/lib/telemetry/csv";
import type { LineFormat } from "@/lib/telemetry/parse";
import { BAUD_RATES, demoProfile, emptyProfile, parseProfile } from "@/lib/telemetry/profile";
import type { Profile } from "@/lib/telemetry/profile";
import { serialSupported } from "@/lib/telemetry/serial";
import { useTelemetryStore } from "@/lib/telemetry/store";
import type { SourceKind } from "@/lib/telemetry/store";
import { useSource } from "@/lib/telemetry/use-source";
import { cn } from "@/lib/utils";

const input = "h-8 min-w-0 rounded-md bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-background px-3 text-sm transition-colors hover:bg-foreground/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2";

const formats: { value: LineFormat; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
  { value: "kv", label: "clave=valor" },
];

const useSerialSupport = () => useSyncExternalStore(() => () => {}, serialSupported, () => true);

function SourcePanel() {
  const source = useTelemetryStore((s) => s.source);
  const status = useTelemetryStore((s) => s.status);
  const error = useTelemetryStore((s) => s.error);
  const profile = useTelemetryStore((s) => s.profiles.serial);
  const { connect, disconnect, select, setProfile } = useTelemetryStore.getState();
  const supported = useSerialSupport();
  const live = status === "live" || status === "connecting";
  const pick = (kind: SourceKind) => {
    if (kind === source) return;
    if (kind === "demo") void connect("demo");
    else void select("serial");
  };

  return (
    <Tile title="Fuente">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-background p-1 text-sm" role="radiogroup" aria-label="Fuente de datos">
        {(["demo", "serial"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={source === kind}
            className={cn("h-8 rounded", source === kind ? "bg-well text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={() => pick(kind)}
          >
            {kind === "demo" ? "DEMO" : "USB serial"}
          </button>
        ))}
      </div>

      {source === "serial" && (
        <div className="mt-4 space-y-3 text-sm">
          {!supported && (
            <p role="alert" className="text-foreground">
              Tu navegador no soporta Web Serial. Usa Chrome o Edge en escritorio.
            </p>
          )}
          <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
            <span className="text-muted-foreground">Baudios</span>
            <select className={input} value={profile.baudRate} disabled={live}
              onChange={(e) => setProfile("serial", { ...profile, baudRate: Number(e.target.value) })}>
              {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
            <span className="text-muted-foreground">Formato</span>
            <select className={input} value={profile.format}
              onChange={(e) => setProfile("serial", { ...profile, format: e.target.value as LineFormat })}>
              {formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {live ? (
          <button type="button" className={button} onClick={() => void disconnect()}>Desconectar</button>
        ) : (
          <button type="button" className={cn(button, "bg-foreground text-background hover:bg-foreground/85")}
            disabled={source === "serial" && !supported} onClick={() => void connect(source)}>
            {source === "serial" ? "Elegir puerto y conectar" : "Iniciar DEMO"}
          </button>
        )}
        <span className="text-sm text-muted-foreground">
          {status === "connecting" ? "Conectando…" : status === "live" ? "Recibiendo" : status === "error" ? "Error" : "Detenido"}
        </span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-foreground">{error}</p>}
      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        Envía una lectura por línea: <code className="font-mono">{'{"temp":21.5}'}</code>, <code className="font-mono">temp=21.5</code> o CSV.
      </p>
    </Tile>
  );
}

function Monitor() {
  const lines = useTelemetryStore((s) => s.lines);
  const count = useTelemetryStore((s) => s.lineCount);
  return (
    <Tile title={`Monitor · ${count} líneas`} className="min-h-48">
      <pre className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5 text-muted-foreground" aria-live="off">
        {lines.length ? lines.join("\n") : "Sin datos todavía."}
      </pre>
    </Tile>
  );
}

function RoleSelect({ label, value, keys, onChange }: { label: string; value: string; keys: string[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {keys.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
    </label>
  );
}

function FieldsPanel() {
  const source = useTelemetryStore((s) => s.source);
  const profile = useTelemetryStore((s) => s.profiles[s.source]);
  const { setProfile, updateField } = useTelemetryStore.getState();
  const file = useRef<HTMLInputElement>(null);
  const keys = profile.fields.map((f) => f.key);
  const save = (p: Profile) => setProfile(source, p);

  const att = profile.attitude ?? { roll: "", pitch: "", yaw: "" };
  const gps = profile.gps ?? { lat: "", lon: "" };
  // Se guardan selecciones parciales; el Visor solo dibuja un rol con todos sus campos.
  const setAtt = (patch: Partial<typeof att>) => save({ ...profile, attitude: { ...att, ...patch } });
  const setGps = (patch: Partial<typeof gps>) => save({ ...profile, gps: { ...gps, ...patch } });

  const importProfile = async (f: File) => {
    try {
      const parsed = parseProfile(JSON.parse(await f.text()));
      if (!parsed) throw new Error();
      save(parsed);
    } catch {
      alert("El archivo no es un perfil válido de CubeOS.");
    }
  };

  return (
    <Tile title="Campos" className="lg:row-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(input, "flex-1 font-medium")} aria-label="Nombre del perfil" value={profile.name}
          onChange={(e) => save({ ...profile, name: e.target.value })} />
        <button type="button" className={button} onClick={() => downloadText(`${profile.name || "perfil"}.cubeos.json`, JSON.stringify(profile, null, 2), "application/json")}>
          <Download className="size-3.5" /> Exportar
        </button>
        <button type="button" className={button} onClick={() => file.current?.click()}>
          <Upload className="size-3.5" /> Importar
        </button>
        <button type="button" className={button} aria-label="Restablecer perfil" title="Restablecer"
          onClick={() => save(source === "demo" ? demoProfile : { ...emptyProfile(), baudRate: profile.baudRate })}>
          <RotateCcw className="size-3.5" />
        </button>
        <input ref={file} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importProfile(f); e.target.value = ""; }} />
      </div>

      {profile.fields.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Los campos aparecen solos al recibir la primera lectura.</p>
      ) : (
        <div className="mt-4 min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-normal">Campo</th>
                <th className="pb-2 font-normal">Nombre</th>
                <th className="pb-2 font-normal">Unidad</th>
                <th className="pb-2 font-normal">Dec.</th>
                <th className="pb-2 text-center font-normal">Ver</th>
              </tr>
            </thead>
            <tbody>
              {profile.fields.map((f) => (
                <tr key={f.key}>
                  <td className="max-w-32 truncate py-1 pr-2 font-mono text-xs" title={f.key}>{f.key}</td>
                  <td className="py-1 pr-2"><input className={cn(input, "w-full")} aria-label={`Nombre de ${f.key}`} value={f.label} onChange={(e) => updateField(f.key, { label: e.target.value })} /></td>
                  <td className="py-1 pr-2"><input className={cn(input, "w-16")} aria-label={`Unidad de ${f.key}`} value={f.unit} onChange={(e) => updateField(f.key, { unit: e.target.value })} /></td>
                  <td className="py-1 pr-2"><input className={cn(input, "w-12")} type="number" min={0} max={6} aria-label={`Decimales de ${f.key}`} value={f.digits} onChange={(e) => updateField(f.key, { digits: Math.min(6, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                  <td className="py-1 text-center"><input type="checkbox" className="size-4 accent-foreground" aria-label={`Mostrar ${f.key}`} checked={f.visible} onChange={(e) => updateField(f.key, { visible: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-sm">Orientación 3D</legend>
              <div className="grid grid-cols-3 gap-2">
                <RoleSelect label="Roll" value={att.roll} keys={keys} onChange={(v) => setAtt({ roll: v })} />
                <RoleSelect label="Pitch" value={att.pitch} keys={keys} onChange={(v) => setAtt({ pitch: v })} />
                <RoleSelect label="Yaw" value={att.yaw} keys={keys} onChange={(v) => setAtt({ yaw: v })} />
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm">Mapa</legend>
              <div className="grid grid-cols-2 gap-2">
                <RoleSelect label="Latitud" value={gps.lat} keys={keys} onChange={(v) => setGps({ lat: v })} />
                <RoleSelect label="Longitud" value={gps.lon} keys={keys} onChange={(v) => setGps({ lon: v })} />
              </div>
            </fieldset>
          </div>
        </div>
      )}
    </Tile>
  );
}

export function ConnectView() {
  useSource({ autoDemo: false });
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      <SourcePanel />
      <FieldsPanel />
      <Monitor />
    </div>
  );
}
