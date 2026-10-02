"use client";

import { useEffect, useState } from "react";

import { startTelemetry } from "@/lib/telemetry-source";
import { useTelemetryStore } from "@/lib/telemetry-store";

export function useTelemetry() {
  const state = useTelemetryStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => startTelemetry(useTelemetryStore), [state.generation]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return { ...state, sample: state.latest, now };
}
