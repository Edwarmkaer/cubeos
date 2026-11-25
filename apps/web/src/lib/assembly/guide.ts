// Guía de armado cargable: piezas y pasos que apuntan a nombres del modelo 3D.

export type GuidePart = { id: string; label: string; qty: number };
export type GuideStep = { title: string; body: string; concept: string; parts: string[]; meshes: string[] };
export type Guide = { title: string; parts: GuidePart[]; steps: GuideStep[] };

const MAX = 200;
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => text(s, 128)).filter(Boolean).slice(0, MAX);

function finish(guide: Guide): Guide {
  if (!guide.steps.length) throw new Error("La guía no tiene pasos.");
  return { ...guide, title: guide.title || "Mi proyecto", parts: guide.parts.slice(0, MAX), steps: guide.steps.slice(0, MAX) };
}

export function parseGuideJson(source: string): Guide {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("El JSON de la guía no es válido.");
  }
  const g = (raw ?? {}) as Record<string, unknown>;
  const parts = (Array.isArray(g.parts) ? g.parts : []).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { id: text(o.id, 64) || `pieza-${i + 1}`, label: text(o.label ?? o.name, 128) || text(o.id, 64), qty: Math.max(1, Math.round(Number(o.qty) || 1)) };
  });
  const steps = (Array.isArray(g.steps) ? g.steps : []).map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      title: text(o.title, 200) || `Paso ${i + 1}`,
      body: text(o.body ?? o.instructions),
      concept: text(o.concept),
      parts: list(o.parts),
      meshes: list(o.meshes),
    };
  });
  return finish({ title: text(g.title, 200), parts, steps });
}

const PART_LINE = /^[-*]\s+(?:([\w-]+)\s*:\s*)?(.+?)(?:\s+x(\d+))?$/i;
const FIELD_LINE = /^(piezas|parts|meshes|modelo)\s*:\s*(.*)$/i;

export function parseGuideMarkdown(source: string): Guide {
  const guide: Guide = { title: "", parts: [], steps: [] };
  let section: "none" | "parts" | "step" = "none";
  let body: string[] = [];
  const flush = () => {
    const step = guide.steps.at(-1);
    if (section === "step" && step) step.body = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    body = [];
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    if (h1 && !guide.title) {
      guide.title = h1[1].trim();
      continue;
    }
    if (h2) {
      flush();
      const heading = h2[1].trim();
      if (/^(piezas|parts)$/i.test(heading)) {
        section = "parts";
      } else {
        section = "step";
        guide.steps.push({ title: heading.replace(/^paso\s*:?\s*/i, "") || `Paso ${guide.steps.length + 1}`, body: "", concept: "", parts: [], meshes: [] });
      }
      continue;
    }
    if (section === "parts") {
      const m = line.trim().match(PART_LINE);
      if (m) {
        const label = m[2].trim();
        guide.parts.push({ id: m[1] ?? label.toLowerCase().replace(/\W+/g, "-"), label, qty: Number(m[3] ?? 1) });
      }
      continue;
    }
    if (section === "step") {
      const step = guide.steps.at(-1)!;
      const field = line.trim().match(FIELD_LINE);
      if (field) {
        const key = field[1].toLowerCase();
        if (key === "piezas" || key === "parts") step.parts = list(field[2]);
        else step.meshes = list(field[2]);
        continue;
      }
      const quote = line.trim().match(/^>\s?(.*)$/);
      if (quote) {
        const t = quote[1].replace(/^concepto\s*:\s*/i, "");
        step.concept = [step.concept, t].filter(Boolean).join(" ");
        continue;
      }
      body.push(line);
    }
  }
  flush();
  return finish(guide);
}

export function parseGuide(source: string, fileName: string): Guide {
  const json = /\.json$/i.test(fileName) || source.trimStart().startsWith("{");
  return json ? parseGuideJson(source) : parseGuideMarkdown(source);
}

/** Convierte un patrón con `*` en una prueba de nombre (sin distinguir mayúsculas). */
export function namePattern(pattern: string) {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
  return (name: string) => re.test(name);
}

/** Índice del primer paso cuyos patrones coinciden con alguno de los nombres (objeto y ancestros). */
export function stepForNames(guide: Guide, names: string[]): number {
  const tests = guide.steps.map((s) => s.meshes.map(namePattern));
  return tests.findIndex((ts) => ts.some((t) => names.some((n) => t(n))));
}
