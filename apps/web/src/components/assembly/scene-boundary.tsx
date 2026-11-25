"use client";

import { Component, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/** Si el navegador no puede crear un contexto WebGL, la guía sigue funcionando sin el modelo. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        Este navegador no tiene WebGL disponible, así que el modelo 3D no puede mostrarse. Los pasos siguen disponibles.
      </p>
    ) : (
      this.props.children
    );
  }
}

const noop = () => () => {};
/** `false` en el servidor y en la hidratación; `true` ya en el navegador. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
