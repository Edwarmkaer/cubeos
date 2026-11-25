"use client";

import { useEffect } from "react";

import { useTelemetryStore } from "./store.ts";

let hydrated = false;
let autoStarted = false;

/** Rehidrata perfiles guardados y arranca la DEMO la primera vez que se abre una vista de datos. */
export function useSource({ autoDemo = true } = {}) {
  useEffect(() => {
    if (!hydrated) {
      hydrated = true;
      void useTelemetryStore.persist.rehydrate();
    }
    if (autoDemo && !autoStarted) {
      autoStarted = true;
      const s = useTelemetryStore.getState();
      if (s.status === "idle") void s.connect("demo");
    }
  }, [autoDemo]);
}
