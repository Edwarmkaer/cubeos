# Monorepo multipaquete

El frontend se construye ahora; el backend FastAPI llega en Sprint 2. Ambos deben hablar el mismo contrato de Muestra. Dos repositorios o tipos duplicados en el cliente harían divergir el JSON al conectar hardware.

**Decisión:** un monorepo pnpm con `apps/web` (Next.js, ver [0004](0004-nextjs-app-router.md)) ahora, `packages/telemetry` como única fuente del contrato, y `apps/api` reservado para Sprint 2. El slice de vista previa ya creó `apps/web` y `packages/telemetry`; `apps/api` sigue sin crearse.

**Status:** amended by [0005-backend-local-cloud-media.md](0005-backend-local-cloud-media.md). El monorepo se conserva; FastAPI y la exclusión inicial de Turborepo son antecedentes de la etapa anterior.

PR2 propone [0006](0006-hardware-v2-contracts.md): `packages/contracts` gobierna
hardware v2; `packages/telemetry` conserva exclusivamente la demo legacy.

## Considered Options

- Dos repositorios (frontend / backend): duplica el contrato y retrasa el Sprint 2.
- Frontend monolítico que “ya definirá tipos” al llegar FastAPI: el WebSocket reescribe la UI.
- Scaffold vacío de `apps/api` desde el día uno: ruido sin código que ejecutar.

## Consequences

El Simulador y el WebSocket implementan `packages/telemetry`. El backend no redefine el JSON a ojo. pnpm workspaces basta para una app y un paquete; no se añade Turborepo hasta que el grafo de build lo pida.
