"use client";

import { ChevronLeft, ChevronRight, Puzzle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startConstruction, useConstructionStore } from "@/lib/construction-store";
import { useTelemetryStore } from "@/lib/telemetry-store";

import { Tile } from "@/components/visor/tile";

function Frame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" className="text-foreground/60">
        <g strokeWidth="3.2" strokeLinecap="square">
          <path d="M28 48 V118" />
          <path d="M78 48 V118" />
          <path d="M46 28 V98" />
          <path d="M96 28 V98" />
        </g>
        <g strokeWidth="1.1">
          <path d="M28 48 L46 28 L96 28 L78 48 Z" />
          <path d="M28 118 L46 98 L96 98 L78 118 Z" />
        </g>
      </g>
    </svg>
  );
}

export function ConstructionView() {
  const selection = useTelemetryStore(s => s.selection);
  const generation = useTelemetryStore(s => s.generation);
  const state = useConstructionStore();
  const session = useRef<ReturnType<typeof startConstruction> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    const active = startConstruction(useTelemetryStore); session.current = active;
    return () => { active.stop(); session.current = null; };
  }, []);
  const progress = state.generation === generation ? state.progress : null;
  const busy = state.generation !== generation || state.status === "loading" || state.status === "saving";
  const steps = progress?.steps ?? [];
  const index = Math.max(0, steps.findIndex(s => s.id === selectedId));
  const step = steps[index];
  const configured = selection.mode !== "demo" && Boolean(selection.apiURL && selection.deviceId);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-auto">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[13rem_minmax(0,1fr)_11rem]">
        <Tile title="Paso">
          <p className="font-mono text-3xl tracking-tight">{step ? index + 1 : "—"} / {steps.length || "—"}</p>
          {steps.length > 0 && <ol className="mt-4 space-y-4 overflow-y-auto text-sm">
            {steps.map(s => <li key={s.id} className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-foreground" aria-label={`Completar ${s.title}`} checked={s.completed} disabled={busy || state.status === "error"} onChange={e => void session.current?.save(s.id, e.target.checked)} />
              <button type="button" className="min-w-0 text-left break-words focus-visible:outline focus-visible:outline-2" aria-current={step?.id === s.id ? "step" : undefined} onClick={() => setSelectedId(s.id)}>{s.title}</button>
            </li>)}
          </ol>}
          <div className="mt-auto pt-4 text-sm text-muted-foreground" aria-live="polite">
            {!configured ? <p>Selecciona tu CubeSat en <a className="underline" href="/configuracion">Configuración</a> para recuperar su progreso.</p> :
              state.status === "loading" ? <p>Cargando progreso…</p> :
              progress && progress.total === 0 ? <p>Guía en preparación. CHASQUI-II aún no ha publicado los pasos de construcción.</p> :
              <p>{selection.deviceName}{state.status === "saving" ? " · Guardando…" : ""}</p>}
            {state.generation === generation && state.error && <><p role="alert" className="mt-2 text-foreground">{state.error}</p><button type="button" className="mt-2 underline" onClick={() => session.current?.reload()}>Recargar progreso</button></>}
          </div>
        </Tile>
        <Tile title="Armazón">
          {step ? <div className="overflow-y-auto">
            <h3 className="text-lg font-medium break-words">{step.title}</h3>
            <p className="mt-4 max-w-prose whitespace-pre-wrap break-words text-sm">{step.instructions}</p>
            {step.completedAt && <p className="mt-4 text-sm text-muted-foreground">Completado: <time dateTime={step.completedAt}>{new Date(step.completedAt).toLocaleString("es-PE")}</time></p>}
          </div> : <Frame className="mx-auto h-full w-full max-h-full min-h-0" />}
        </Tile>
        <Tile title="Vista">
          <Frame className="mx-auto h-full w-full max-h-48 min-h-0" />
        </Tile>
      </div>
      <div className="flex shrink-0 items-center gap-3 rounded-md bg-well px-4 py-3">
        <Puzzle className="size-4 text-muted-foreground" />
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground"
          aria-label="Paso anterior"
          disabled={!step || index === 0}
          onClick={() => setSelectedId(steps[index - 1].id)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="relative h-1.5 flex-1 rounded-full bg-background" role="progressbar" aria-label="Progreso de construcción" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.percentage ?? 0}>
          <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/40" style={{ width: `${progress?.percentage ?? 0}%` }} />
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">{progress?.total ? `${progress.completed} / ${progress.total} pasos · ${Math.round(progress.percentage)}%` : "Sin pasos publicados"}</span>
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground"
          aria-label="Paso siguiente"
          disabled={!step || index === steps.length - 1}
          onClick={() => setSelectedId(steps[index + 1].id)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
