import type { LineFormat } from "./parse.ts";

export type FieldConfig = {
  key: string;
  label: string;
  unit: string;
  digits: number;
  visible: boolean;
};

export type Profile = {
  version: 1;
  name: string;
  format: LineFormat;
  baudRate: number;
  csvColumns: string[];
  fields: FieldConfig[];
  attitude: { roll: string; pitch: string; yaw: string } | null;
  gps: { lat: string; lon: string } | null;
};

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const HINTS: [RegExp, string, string, number][] = [
  [/^(temp|temperature|t)(_?c)?$/i, "Temperatura", "°C", 1],
  [/^(hum|humidity|rh)$/i, "Humedad", "%", 0],
  [/^(pres|pressure|p)$/i, "Presión", "hPa", 1],
  [/^(alt|altitude)$/i, "Altitud", "m", 1],
  [/^(lux|light)$/i, "Luz", "lx", 0],
  [/^uv/i, "UV", "", 1],
  [/^roll$/i, "Roll", "°", 1],
  [/^pitch$/i, "Pitch", "°", 1],
  [/^yaw$/i, "Yaw", "°", 1],
  [/^(lat|latitude)$/i, "Latitud", "°", 5],
  [/^(lon|lng|longitude)$/i, "Longitud", "°", 5],
  [/^(v|volt|voltage|vbat|bat)$/i, "Voltaje", "V", 2],
  [/^(rssi)$/i, "RSSI", "dBm", 0],
];

export function guessField(key: string): FieldConfig {
  const leaf = key.split(".").at(-1) ?? key;
  const hint = HINTS.find(([re]) => re.test(leaf));
  return {
    key,
    label: hint ? hint[1] : leaf.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    unit: hint ? hint[2] : "",
    digits: hint ? hint[3] : 2,
    visible: true,
  };
}

function find(keys: string[], re: RegExp) {
  return keys.find((k) => re.test(k.split(".").at(-1) ?? k));
}

/** Añade campos nuevos al perfil y asigna orientación/GPS si aún no están definidos. */
export function mergeKeys(profile: Profile, keys: string[]): Profile {
  const known = new Set(profile.fields.map((f) => f.key));
  const added = keys.filter((k) => !known.has(k));
  if (!added.length) return profile;
  const all = [...profile.fields.map((f) => f.key), ...added];
  const roll = find(all, /^roll$/i), pitch = find(all, /^pitch$/i), yaw = find(all, /^yaw$/i);
  const lat = find(all, /^(lat|latitude)$/i), lon = find(all, /^(lon|lng|longitude)$/i);
  return {
    ...profile,
    fields: [...profile.fields, ...added.map(guessField)],
    attitude: profile.attitude ?? (roll && pitch && yaw ? { roll, pitch, yaw } : null),
    gps: profile.gps ?? (lat && lon ? { lat, lon } : null),
  };
}

export function emptyProfile(name = "Mi placa"): Profile {
  return { version: 1, name, format: "auto", baudRate: 115200, csvColumns: [], fields: [], attitude: null, gps: null };
}

export const demoProfile: Profile = mergeKeys(
  { ...emptyProfile("DEMO"), format: "json" },
  ["temperature", "humidity", "uv", "roll", "pitch", "yaw", "lat", "lon", "alt"],
);

const str = (v: unknown, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");

/** Valida un perfil importado; devuelve null si no tiene la forma esperada. */
export function parseProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1 || !Array.isArray(p.fields)) return null;
  const format = ["auto", "json", "csv", "kv"].includes(p.format as string) ? (p.format as LineFormat) : "auto";
  const fields = p.fields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as Record<string, unknown>).key === "string")
    .slice(0, 64)
    .map((f) => ({
      key: str(f.key, 128),
      label: str(f.label) || str(f.key),
      unit: str(f.unit, 16),
      digits: Math.min(6, Math.max(0, Math.round(Number(f.digits) || 0))),
      visible: f.visible !== false,
    }));
  const keys = new Set(fields.map((f) => f.key));
  const role = <T extends Record<string, string>>(v: unknown, names: (keyof T)[]): T | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    return names.every((n) => typeof o[n as string] === "string" && (o[n as string] === "" || keys.has(o[n as string] as string)))
      ? (Object.fromEntries(names.map((n) => [n, o[n as string]])) as T)
      : null;
  };
  return {
    version: 1,
    name: str(p.name) || "Perfil importado",
    format,
    baudRate: BAUD_RATES.includes(Number(p.baudRate)) ? Number(p.baudRate) : 115200,
    csvColumns: Array.isArray(p.csvColumns) ? p.csvColumns.map((c) => str(c, 128)).slice(0, 64) : [],
    fields,
    attitude: role<{ roll: string; pitch: string; yaw: string }>(p.attitude, ["roll", "pitch", "yaw"]),
    gps: role<{ lat: string; lon: string }>(p.gps, ["lat", "lon"]),
  };
}
