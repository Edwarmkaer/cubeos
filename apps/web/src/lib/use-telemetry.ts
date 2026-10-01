"use client";

import { useEffect } from "react";

import { simulatorSource } from "@/lib/telemetry-source";
import { useTelemetryStore } from "@/lib/telemetry-store";

export function useTelemetry() {
  const sample = useTelemetryStore((state) => state.latest);
  const history = useTelemetryStore((state) => state.history);
  const connection = useTelemetryStore((state) => state.connection);
  const push = useTelemetryStore((state) => state.push);
  const setConnection = useTelemetryStore((state) => state.setConnection);

  useEffect(() => {
    return simulatorSource.start({
      current: useTelemetryStore.getState().latest,
      onConnection: setConnection,
      onSample: push,
    });
  }, [push, setConnection]);

  return { sample, history, connection };
}
