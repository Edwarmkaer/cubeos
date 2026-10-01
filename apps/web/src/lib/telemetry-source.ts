import type { ConnectionState, TelemetrySample } from "@cubeos/telemetry";

import { nextSample } from "@/lib/simulator";

const PERIOD_MS = 500;

export type TelemetrySource = {
  start: (handlers: {
    current: TelemetrySample;
    onConnection: (connection: ConnectionState) => void;
    onSample: (sample: TelemetrySample) => void;
  }) => () => void;
};

export const simulatorSource: TelemetrySource = {
  start({ current, onConnection, onSample }) {
    let previous = current;
    onConnection("simulated");

    const id = window.setInterval(() => {
      previous = nextSample(previous);
      onSample(previous);
    }, PERIOD_MS);

    return () => window.clearInterval(id);
  },
};
