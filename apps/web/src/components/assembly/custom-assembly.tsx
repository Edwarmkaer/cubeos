"use client";

import { ChevronLeft, ChevronRight, Eye, FileUp, Trash2 } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { SceneBoundary, useMounted } from "@/components/assembly/scene-boundary";
import { Tile } from "@/components/visor/tile";
import { useCustomAssembly } from "@/lib/assembly/custom-store";
import { parseGuide, stepForNames } from "@/lib/assembly/guide";
import type { Guide } from "@/lib/assembly/guide";
import { clearProject, loadProject, saveProject } from "@/lib/assembly/project-db";
import type { StoredProject } from "@/lib/assembly/project-db";
import { cn } from "@/lib/utils";

const CustomScene = lazy(() => import("@/components/assembly/custom-scene").then((m) => ({ default: m.CustomScene })));

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-background/85 px-3 text-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline focus-visible:outline-2";

type Ready = { url: string; guide: Guide; project: StoredProject };
type State = { status: "loading" | "empty" } | { status: "ready"; data: Ready } | { status: "error"; error: string };

function prepare(project: StoredProject): Ready {
  return { project, guide: parseGuide(project.guide, project.guideName), url: URL.createObjectURL(project.model) };
}

function Loader({ onLoad, error }: { onLoad: (p: StoredProject) => void; error: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<File | null>(null);
  const [guide, setGuide] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const add = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      if (/\.glb$/i.test(f.name)) setModel(f);
      else if (/\.(json|md|markdown|txt)$/i.test(f.name)) setGuide(f);
    }
  };
  const submit = async () => {
    if (!model || !guide) return;
    onLoad({ model, modelName: model.name, guide: await guide.text(), guideName: guide.name });
  };
  const example = async () => {
    setBusy(true);
    try {
      const [m, g] = await Promise.all([fetch("/examples/cubesat-basico.glb"), fetch("/examples/cubesat-basico.md")]);
      onLoad({ model: await m.blob(), modelName: "cubesat-basico.glb", guide: await g.text(), guideName: "cubesat-basico.md" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center overflow-auto rounded-md bg-well p-6">
      <div className="w-full max-w-lg">
        <h2 className="text-xl font-medium">Carga tu proyecto</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Un modelo <code className="font-mono">.glb</code> y una guía en Markdown o JSON. Cada paso nombra los objetos del modelo que se montan.
          Se guarda solo en este navegador.
        </p>
        <button
          type="button"
          className="mt-5 grid w-full place-items-center gap-2 rounded-md border border-dashed border-foreground/25 px-4 py-8 text-sm transition-colors hover:border-foreground/60"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        >
          <FileUp className="size-5 text-muted-foreground" />
          Arrastra los archivos o haz clic para elegirlos
        </button>
        <input ref={input} type="file" multiple hidden accept=".glb,.json,.md,.markdown,.txt" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          <li>Modelo: {model?.name ?? "—"}</li>
          <li>Guía: {guide?.name ?? "—"}</li>
        </ul>
        {error && <p role="alert" className="mt-3 text-sm text-foreground">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className={cn(button, "bg-foreground text-background hover:bg-foreground/85")} disabled={!model || !guide} onClick={() => void submit()}>
            Abrir proyecto
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => void example()}>
            Probar con el ejemplo
          </button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Plantillas: <a className="underline underline-offset-4" href="/examples/cubesat-basico.md" download>guía Markdown</a> ·{" "}
          <a className="underline underline-offset-4" href="/examples/plantilla-guia.json" download>guía JSON</a> ·{" "}
          <a className="underline underline-offset-4" href="/examples/cubesat-basico.glb" download>modelo de ejemplo</a>
        </p>
      </div>
    </div>
  );
}

function Workspace({ data, onReplaceGuide, onClear }: { data: Ready; onReplaceGuide: (f: File) => void; onClear: () => void }) {
  const { guide, url } = data;
  const mounted = useMounted();
  const step = useCustomAssembly((s) => s.step);
  const showAll = useCustomAssembly((s) => s.showAll);
  const selected = useCustomAssembly((s) => s.selected);
  const checked = useCustomAssembly((s) => s.checked);
  const { goTo, setShowAll, toggle } = useCustomAssembly.getState();
  const [names, setNames] = useState<string[]>([]);
  const guideInput = useRef<HTMLInputElement>(null);
  const index = Math.min(step, guide.steps.length - 1);
  const current = guide.steps[index];
  const total = guide.steps.length;
  const onNames = useCallback((n: string[]) => setNames(n), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") goTo(index + 1, total);
      if (e.key === "ArrowLeft") goTo(index - 1, total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, total]);

  const partsOf = current.parts.map((id) => guide.parts.find((p) => p.id === id) ?? { id, label: id, qty: 1 });
  const selectedStep = selected ? stepForNames(guide, [selected]) : -1;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-auto">
      <div className="grid shrink-0 grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <Tile title={guide.title} className="order-2 lg:order-none">
          <ol className="space-y-1 overflow-y-auto text-sm">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className={cn("mt-1.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]",
                  i === index ? "bg-[var(--chart-roll)] text-background" : i < index ? "bg-foreground/20" : "bg-background text-muted-foreground")}>
                  {i + 1}
                </span>
                <button type="button" aria-current={i === index ? "step" : undefined} onClick={() => goTo(i, total)}
                  className={cn("min-w-0 rounded px-1.5 py-1 text-left break-words", i === index ? "bg-background" : "text-muted-foreground hover:text-foreground")}>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </Tile>

        <section aria-label="Modelo 3D del proyecto" className="order-1 flex flex-col overflow-hidden rounded-md bg-well lg:relative lg:order-none">
          <div className="relative min-h-[22rem] flex-1">
            {mounted && (
              <SceneBoundary>
                <Suspense fallback={<p className="grid h-full place-items-center text-sm text-muted-foreground">Cargando modelo…</p>}>
                  <CustomScene className="!absolute inset-0" url={url} guide={guide} onNames={onNames} />
                </Suspense>
              </SceneBoundary>
            )}
            <div className="absolute inset-x-3 top-3 flex flex-wrap gap-2">
              <button type="button" className={button} aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>
                <Eye className="size-3.5" /> {showAll ? "Ver por pasos" : "Ver completo"}
              </button>
              <button type="button" className={button} onClick={() => guideInput.current?.click()}>
                <FileUp className="size-3.5" /> Cambiar guía
              </button>
              <button type="button" className={button} onClick={onClear} aria-label="Cerrar proyecto" title="Cerrar proyecto">
                <Trash2 className="size-3.5" />
              </button>
              <input ref={guideInput} type="file" hidden accept=".json,.md,.markdown,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplaceGuide(f); e.target.value = ""; }} />
            </div>
          </div>
          <div className="m-3 mt-0 rounded-md bg-background/85 p-4 backdrop-blur lg:absolute lg:bottom-3 lg:left-3 lg:m-0 lg:max-w-xl">
            <p className="font-mono text-xs text-[var(--chart-roll)]">Paso {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
            <h3 className="mt-1 text-lg font-medium break-words">{current.title}</h3>
            {current.body && <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/80">{current.body}</p>}
          </div>
        </section>

        <Tile title="Este paso" className="order-3 lg:order-none">
          <div className="min-h-0 space-y-5 overflow-y-auto text-sm">
            {partsOf.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Piezas</h4>
                <ul className="space-y-1.5">
                  {partsOf.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="size-4 accent-foreground" checked={checked.includes(p.id)} onChange={() => toggle(p.id)} />
                        <span className={cn(checked.includes(p.id) && "text-muted-foreground line-through")}>{p.label}</span>
                        {p.qty > 1 && <span className="ml-auto font-mono text-xs text-muted-foreground">×{p.qty}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {current.concept && (
              <section className="rounded-md bg-background p-3">
                <h4 className="mb-1 text-xs uppercase tracking-wider text-[var(--chart-roll)]">Concepto</h4>
                <p>{current.concept}</p>
              </section>
            )}
            <section>
              <h4 className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Selección</h4>
              <p className="text-muted-foreground">
                {selected ? <><span className="font-mono text-foreground">{selected}</span>{selectedStep >= 0 && ` · paso ${selectedStep + 1}`}</> : "Haz clic en una pieza del modelo."}
              </p>
            </section>
            <details>
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">Objetos del modelo ({names.length})</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-xs text-muted-foreground">
                {names.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          </div>
        </Tile>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-md bg-well px-4 py-3">
        <button type="button" className="grid size-8 place-items-center text-muted-foreground disabled:opacity-40" aria-label="Paso anterior" disabled={index === 0} onClick={() => goTo(index - 1, total)}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="relative h-1.5 flex-1 rounded-full bg-background" role="progressbar" aria-label="Progreso del armado" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
          <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-roll)]/70 transition-[width]" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <span className="text-sm text-muted-foreground">Paso {index + 1} de {total} · ← →</span>
        <button type="button" className="grid size-8 place-items-center text-muted-foreground disabled:opacity-40" aria-label="Paso siguiente" disabled={index === total - 1} onClick={() => goTo(index + 1, total)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function CustomAssembly() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useCustomAssembly.persist.rehydrate();
    let cancelled = false;
    void loadProject().then((p) => {
      if (cancelled) return;
      if (!p) return setState({ status: "empty" });
      try {
        setState({ status: "ready", data: prepare(p) });
      } catch (e) {
        setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    const url = state.data.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  const open = async (project: StoredProject, keepProgress = false) => {
    try {
      const data = prepare(project);
      await saveProject(project).catch(() => setError("No se pudo guardar en este navegador; el proyecto se perderá al recargar."));
      if (!keepProgress) useCustomAssembly.getState().reset();
      setError(null);
      setState({ status: "ready", data });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (state.status === "loading") return <p className="grid h-full place-items-center text-sm text-muted-foreground">Cargando proyecto…</p>;
  if (state.status !== "ready") return <Loader onLoad={(p) => void open(p)} error={state.status === "error" ? state.error : error} />;
  return (
    <>
      {error && <p role="alert" className="mb-2 shrink-0 text-sm">{error}</p>}
      <Workspace
        data={state.data}
        onReplaceGuide={async (f) => void open({ ...state.data.project, guide: await f.text(), guideName: f.name }, true)}
        onClear={() => { void clearProject(); useCustomAssembly.getState().reset(); setState({ status: "empty" }); }}
      />
    </>
  );
}
