"use client";

import { ChevronLeft, ChevronRight, Puzzle } from "lucide-react";
import { Suspense, lazy, useEffect } from "react";

import { PartTelemetry } from "@/components/assembly/part-telemetry";
import { SceneBoundary, useMounted } from "@/components/assembly/scene-boundary";
import { Tile } from "@/components/visor/tile";
import { assemblySteps, parts } from "@/lib/assembly-guide";
import { useAssemblyStore } from "@/lib/assembly-store";
import { cn } from "@/lib/utils";

// WebGL solo existe en el navegador: la escena se carga después de montar.
const AssemblyScene = lazy(() =>
  import("@/components/assembly/assembly-scene").then((m) => ({ default: m.AssemblyScene })),
);

function SceneToolbar() {
  const mode = useAssemblyStore((s) => s.mode);
  const explode = useAssemblyStore((s) => s.explode);
  const setMode = useAssemblyStore((s) => s.setMode);
  const setExplode = useAssemblyStore((s) => s.setExplode);
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Modo del visor 3D" className="flex rounded-md bg-background/80 p-0.5 backdrop-blur">
        {(["armar", "explosionada"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-sm transition-colors",
              mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "armar" ? "Armar" : "Explosionada"}
          </button>
        ))}
      </div>
      {mode === "explosionada" && (
        <label className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
          Separación
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            className="w-28 accent-[var(--chart-roll)]"
          />
        </label>
      )}
    </div>
  );
}

function PartPanel() {
  const mode = useAssemblyStore((s) => s.mode);
  const step = useAssemblyStore((s) => s.step);
  const selected = useAssemblyStore((s) => s.selected);
  const id = selected ?? (mode === "armar" ? assemblySteps[step].parts[0] : null);
  if (!id)
    return <p className="text-sm text-muted-foreground">Toca una pieza en el modelo para ver su función y su telemetría.</p>;
  const part = parts[id];
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div>
        <h3 className="text-lg font-medium">{part.name}</h3>
        <p className="mt-2 text-sm text-foreground/80">{part.role}</p>
      </div>
      <ul className="space-y-1 font-mono text-xs text-muted-foreground">
        {part.specs.map((spec) => (
          <li key={spec}>· {spec}</li>
        ))}
      </ul>
      {part.telemetry && (
        <section>
          <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Telemetría en vivo</h4>
          <PartTelemetry channels={part.telemetry} />
        </section>
      )}
    </div>
  );
}

export function ConstructionView() {
  const mounted = useMounted();
  const mode = useAssemblyStore((s) => s.mode);
  const guideStep = useAssemblyStore((s) => s.step);
  const goTo = useAssemblyStore((s) => s.goTo);

  useEffect(() => {
    void useAssemblyStore.persist.rehydrate();
  }, []);

  const steps = assemblySteps;
  const index = Math.min(guideStep, steps.length - 1);
  const step = steps[index];
  const percentage = (index / steps.length) * 100;
  const status = `Paso ${index + 1} de ${steps.length}`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-auto">
      <div className="grid shrink-0 grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <Tile title="Pasos" className="order-2 lg:order-none">
          <ol className="space-y-1 overflow-y-auto text-sm">
            {steps.map((s, i) => {
              const done = i < index;
              return (
                <li key={s.id} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]",
                      i === index ? "bg-[var(--chart-roll)] text-background" : done ? "bg-foreground/20 text-foreground" : "bg-background text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 rounded px-1.5 py-1 text-left break-words transition-colors focus-visible:outline focus-visible:outline-2",
                      i === index ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-current={i === index ? "step" : undefined}
                    onClick={() => goTo(i)}
                  >
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </Tile>

        <section
          aria-label="Visor 3D del ensamble"
          className="order-1 flex flex-col overflow-hidden rounded-md bg-well lg:relative lg:order-none"
        >
          <div className="relative min-h-[22rem] flex-1">
          {mounted && (
            <SceneBoundary>
            <Suspense fallback={<p className="grid h-full place-items-center text-sm text-muted-foreground">Cargando modelo 3D…</p>}>
              <AssemblyScene className="!absolute inset-0" />
            </Suspense>
            </SceneBoundary>
          )}
          <div className="pointer-events-none absolute inset-x-3 top-3">
            <SceneToolbar />
          </div>
          </div>
          {mode === "armar" && step && (
            <div className="pointer-events-none m-3 mt-0 rounded-md bg-background/85 p-4 backdrop-blur lg:absolute lg:bottom-3 lg:left-3 lg:m-0 lg:max-w-xl">
              <p className="font-mono text-xs text-[var(--chart-roll)]">
                Paso {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-lg font-medium break-words">{step.title}</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/80">{step.instructions}</p>
            </div>
          )}
        </section>

        <Tile title="Pieza" className="order-3 lg:order-none">
          <PartPanel />
        </Tile>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-md bg-well px-4 py-3">
        <Puzzle className="size-4 text-muted-foreground" />
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground disabled:opacity-40"
          aria-label="Paso anterior"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <div
          className="relative h-1.5 flex-1 rounded-full bg-background"
          role="progressbar"
          aria-label="Progreso de construcción"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentage)}
        >
          <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-roll)]/70 transition-[width]" style={{ width: `${percentage}%` }} />
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">{status}</span>
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground disabled:opacity-40"
          aria-label="Paso siguiente"
          disabled={index === steps.length - 1}
          onClick={() => goTo(index + 1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
