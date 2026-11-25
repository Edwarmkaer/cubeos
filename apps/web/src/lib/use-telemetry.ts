"use client";

import { useEffect } from "react";

import { useTelemetryStore } from "@/lib/telemetry-store";

export function useTelemetry() {
  const state = useTelemetryStore();
  useEffect(() => {
    const timer = setInterval(() => useTelemetryStore.getState().tick(), 500);
    return () => clearInterval(timer);
  }, []);
  return { ...state, sample: state.latest };
}
