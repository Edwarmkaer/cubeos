import type { Reading } from "./store.ts";

export function readingsToCsv(readings: Reading[]): string {
  const keys = [...new Set(readings.flatMap((r) => Object.keys(r.values)))];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = readings.map((r) => [new Date(r.t).toISOString(), ...keys.map((k) => (k in r.values ? String(r.values[k]) : ""))].join(","));
  return [["time", ...keys].map(esc).join(","), ...rows].join("\n") + "\n";
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
