import { setTimeout as delay } from "node:timers/promises";
import type { Writable } from "node:stream";
import { once } from "node:events";
import type { ScheduledPacket } from "./index.ts";

export type DeliveryOptions = { transport: "serial" | "http"; writer?: Writable; url?: string; credential?: string; rate?: number; signal: AbortSignal };
/** Rate scales logical replay time; network writes remain sequential and bounded. */
export async function deliver(packets: ScheduledPacket[], options: DeliveryOptions): Promise<void> {
  const rate = options.rate ?? 1;
  if (!Number.isFinite(rate) || rate < 0.1 || rate > 100) throw new Error("rate must be in [0.1, 100]");
  let target: URL | undefined;
  if (options.transport === "http") {
    if (!options.url || !options.credential) throw new Error("HTTP needs URL and CUBEOS_SOURCE_CREDENTIAL");
    target = new URL(options.url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== "/api/v1/ingestion/packets") throw new Error("invalid ingestion URL");
  } else if (!options.writer) throw new Error("serial needs an output stream");
  const start = performance.now();
  for (const packet of packets) {
    options.signal.throwIfAborted();
    const wait = packet.atMs / rate - (performance.now() - start);
    if (wait > 0) await delay(wait, undefined, { signal: options.signal });
    const body = JSON.stringify(packet.envelope);
    if (target) {
      const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.credential}` }, body, redirect: "error", signal: AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) });
      // Intentional invalid frames in scenarios remain observable rejections.
      await response.body?.cancel();
      if (!response.ok && response.status !== 422) throw new Error(`ingestion returned ${response.status}`);
    } else if (!options.writer!.write(`${body}\n`)) {
      await once(options.writer!, "drain", { signal: options.signal });
    }
  }
}
