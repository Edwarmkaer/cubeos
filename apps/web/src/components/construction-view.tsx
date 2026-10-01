"use client";

import { ChevronLeft, ChevronRight, Puzzle } from "lucide-react";

import { Tile } from "@/components/visor/tile";

function Frame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" className="text-foreground/60">
        <g strokeWidth="3.2" strokeLinecap="square">
          <path d="M28 48 V118" />
          <path d="M78 48 V118" />
          <path d="M46 28 V98" />
          <path d="M96 28 V98" />
        </g>
        <g strokeWidth="1.1">
          <path d="M28 48 L46 28 L96 28 L78 48 Z" />
          <path d="M28 118 L46 98 L96 98 L78 118 Z" />
        </g>
      </g>
    </svg>
  );
}

export function ConstructionView() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)_11rem] gap-3">
        <Tile title="Paso">
          <p className="font-mono text-3xl tracking-tight">— / —</p>
          <ul className="mt-8 space-y-4 text-sm">
            {[1, 2, 1].map((qty, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="size-8 shrink-0 rounded-sm bg-surface" />
                <span className="font-mono text-muted-foreground">{qty}×</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-4 text-sm text-muted-foreground">
            El catálogo de pasos aún no está escrito.
          </p>
        </Tile>
        <Tile title="Armazón">
          <Frame className="mx-auto h-full w-full max-h-full min-h-0" />
        </Tile>
        <Tile title="Vista">
          <Frame className="mx-auto h-full w-full max-h-48 min-h-0" />
        </Tile>
      </div>
      <div className="flex shrink-0 items-center gap-3 rounded-md bg-well px-4 py-3">
        <Puzzle className="size-4 text-muted-foreground" />
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground"
          aria-label="Paso anterior"
          disabled
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="relative h-1.5 flex-1 rounded-full bg-background">
          <span className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-foreground/40" />
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center text-muted-foreground"
          aria-label="Paso siguiente"
          disabled
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
