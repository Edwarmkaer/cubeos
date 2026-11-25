// Convierte una línea de texto recibida en un conjunto de campos numéricos.

export type LineFormat = "auto" | "json" | "csv" | "kv";
export type ParsedLine =
  | { kind: "values"; values: Record<string, number> }
  | { kind: "header"; columns: string[] }
  | { kind: "skip" };

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const KV = /([A-Za-z_][\w.\-]*)\s*[:=]\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gi;
const MAX_FIELDS = 64;

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "string" && NUMBER.test(raw.trim())) return Number(raw);
  return null;
}

function flatten(object: unknown, prefix: string, out: Record<string, number>) {
  if (Object.keys(out).length >= MAX_FIELDS) return;
  if (object !== null && typeof object === "object") {
    const entries = Array.isArray(object) ? object.map((v, i) => [String(i), v] as const) : Object.entries(object);
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  const n = toNumber(object);
  if (n !== null && prefix) out[prefix] = n;
}

export function detectFormat(line: string): Exclude<LineFormat, "auto"> {
  const t = line.trim();
  if (t.startsWith("{")) return "json";
  if (new RegExp(KV.source, "i").test(t)) return "kv";
  return "csv";
}

function splitCsv(line: string) {
  const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(sep).map((s) => s.trim());
}

export function parseLine(line: string, format: LineFormat, columns: string[] = []): ParsedLine {
  const text = line.trim();
  if (!text) return { kind: "skip" };
  const kind = format === "auto" ? detectFormat(text) : format;

  if (kind === "json") {
    try {
      const out: Record<string, number> = {};
      flatten(JSON.parse(text), "", out);
      return Object.keys(out).length ? { kind: "values", values: out } : { kind: "skip" };
    } catch {
      return { kind: "skip" };
    }
  }

  if (kind === "kv") {
    const out: Record<string, number> = {};
    for (const m of text.matchAll(KV)) {
      if (Object.keys(out).length >= MAX_FIELDS) break;
      out[m[1]] = Number(m[2]);
    }
    return Object.keys(out).length ? { kind: "values", values: out } : { kind: "skip" };
  }

  const cells = splitCsv(text).slice(0, MAX_FIELDS);
  const numbers = cells.map((c) => toNumber(c));
  if (numbers.every((n) => n === null)) {
    const names = cells.filter(Boolean);
    return names.length ? { kind: "header", columns: names } : { kind: "skip" };
  }
  const out: Record<string, number> = {};
  numbers.forEach((n, i) => {
    if (n !== null) out[columns[i] || `c${i + 1}`] = n;
  });
  return { kind: "values", values: out };
}
