# Next.js en apps/web

Vite era el bundler del ADR 0001. El equipo trabaja más fluido en Next.js, y las tres superficies (Visor, Construcción, Configuración) encajan en rutas de App Router. Aún no hay código, así que el coste de cambiar es bajo. El workflow del workspace sigue mandando: web estática primero, 3D después.

**Decisión:** `apps/web` usa Next.js (App Router) con pnpm. Zustand, Tailwind CSS y Lucide se mantienen. El Visor en vivo corre en Client Components. Three.js, Recharts y React-Leaflet entran **después** de aprobar la composición estática. No se usan Route Handlers de Next como backend de telemetría: eso sigue en `apps/api` (Sprint 2).

Sustituye a [0001-stack-frontend.md](0001-stack-frontend.md) en la parte del bundler.

**Status:** accepted

## Considered Options

- React + Vite (ADR 0001): más simple como SPA, menos familiar para quien implementa.
- Next.js App Router: elegida por hábito del equipo, rutas nativas y espacio para Construcción como contenido estático.
- Usar API routes de Next en lugar de FastAPI: se descarta. El Sprint 2 necesita serial/radio y SQLite en Python.

## Consequences

El primer slice es HTML/CSS de shell y Visor, sin WebGL. La telemetría a 2 Hz no se renderiza en el servidor. pnpm no cambia ([0003](0003-monorepo-multipaquete.md)).
