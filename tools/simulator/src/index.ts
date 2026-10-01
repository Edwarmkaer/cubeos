import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { validateUplinkV2, type UplinkV2, type ReceiverMetadata } from "@cubeos/contracts";
import examples from "@cubeos/contracts/fixtures/chasqui-v2/uplink-examples-v2.json" with { type: "json" };

export type Scenario = "normal" | "duplicate" | "out-of-order" | "reboot" | "failures";
export type SimulationOptions = { seed?: number; durationMs?: number; gps?: boolean; scenario?: Scenario };
// Failure fixtures may intentionally omit a required measurement; never call them validated input.
type SimulatedPayload = Partial<UplinkV2> & Pick<UplinkV2, "v" | "id" | "m" | "n" | "u" | "t" | "st" | "fl">;
export type ScheduledPacket = { atMs: number; envelope: { envelopeVersion: 1; payload: SimulatedPayload; receiver?: ReceiverMetadata } };
const scenarios: Scenario[] = ["normal", "duplicate", "out-of-order", "reboot", "failures"];

function checkedOptions(options: SimulationOptions) {
  const { seed = 42, durationMs = 4000, gps = false, scenario = "normal" } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be uint32");
  if (!Number.isInteger(durationMs) || durationMs < 2000 || durationMs > 3600000) throw new Error("duration-ms must be an integer in [2000, 3600000]");
  if (!scenarios.includes(scenario)) throw new Error("unknown scenario");
  if (typeof gps !== "boolean") throw new Error("gps must be boolean");
  return { seed, durationMs, gps, scenario };
}

/** Emit logical reception times without sleeping, networking, or hardware access. */
export function simulate(options: SimulationOptions = {}): ScheduledPacket[] {
  const { seed, durationMs, gps, scenario } = checkedOptions(options);
  let randomState = seed;
  const jitter = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return Math.floor((randomState / 0x100000000) * 101) - 50;
  };
  const packets: ScheduledPacket[] = [];
  const discontinuityMs = Math.ceil(durationMs / 1000) * 500;
  let sequence = 0;
  let omitted = false;
  for (let atMs = 0; atMs < durationMs; atMs += 500) {
    if (scenario === "reboot" && atMs === discontinuityMs) sequence = 0;
    for (const template of examples) {
      const interval = template.m === "I" ? 500 : template.m === "G" ? 2000 : 1000;
      if ((template.m === "G" && !gps) || atMs % interval !== 0) continue;
      const uptime = scenario === "reboot" && atMs >= discontinuityMs ? atMs - discontinuityMs : atMs;
      const p = { ...template, n: sequence++, u: uptime, t: gps ? 1790263810 + Math.floor(atMs / 1000) : 0, fl: gps ? 0 : 1, st: scenario === "reboot" && atMs >= discontinuityMs && uptime === 0 ? 0 : 1 };
      if (p.m === "E") p.t1 = 2465 + jitter();
      if (p.m === "O") p.lx = 341 + jitter();
      if (p.m === "I") p.ax = -23 + jitter();
      if (p.m === "G") p.al = 81240 + jitter();
      if (scenario === "failures" && atMs >= discontinuityMs) {
        p.fl |= 2;
        if (p.m === "H") { p.cam = 0; p.fl |= 16; }
      }
      // Even the simulator validates normal templates against the unchanged hardware schema.
      if (!validateUplinkV2(p)) throw new Error("simulator produced an invalid baseline packet");
      const payload: SimulatedPayload = p;
      if (scenario === "failures" && atMs >= discontinuityMs && p.m === "E" && !omitted) {
        Reflect.deleteProperty(payload, "t1");
        omitted = true;
      }
      packets.push({ atMs, envelope: { envelopeVersion: 1, payload, receiver: { gatewayId: "SIMULATOR" } } });
    }
  }
  if (scenario === "duplicate") packets.splice(1, 0, structuredClone(packets[0]));
  if (scenario === "out-of-order") {
    const delayedIndex = packets.findIndex(p => p.atMs === 500 && p.envelope.payload.m === "I");
    const [delayed] = packets.splice(delayedIndex, 1);
    const newerIndex = packets.findIndex(p => p.atMs === 1000 && p.envelope.payload.m === "I");
    delayed.atMs = 1000;
    packets.splice(newerIndex + 1, 0, delayed);
  }
  return packets;
}

function main() {
  const { values } = parseArgs({ options: {
    seed: { type: "string" }, "duration-ms": { type: "string" }, gps: { type: "boolean" },
    scenario: { type: "string" }, format: { type: "string", default: "ndjson" }, help: { type: "boolean" },
  }, allowPositionals: false });
  if (values.help) {
    process.stdout.write("CubeOS simulator: --seed uint32 --duration-ms 2000..3600000 --gps --scenario normal|duplicate|out-of-order|reboot|failures --format ndjson|fixture\n");
    return;
  }
  if (values.format !== "ndjson" && values.format !== "fixture") throw new Error("format must be ndjson or fixture");
  const packets = simulate({
    ...(values.seed !== undefined && { seed: Number(values.seed) }),
    ...(values["duration-ms"] !== undefined && { durationMs: Number(values["duration-ms"]) }),
    gps: values.gps ?? false,
    scenario: (values.scenario ?? "normal") as Scenario,
  });
  if (values.format === "fixture") process.stdout.write(`${JSON.stringify(packets, null, 2)}\n`);
  else for (const { envelope } of packets) process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    process.stderr.write(`CubeOS simulator: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
