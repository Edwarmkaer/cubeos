# CubeOS

Plataforma web educativa de estación terrena para CubeSat. Pertenece al grupo CHASQUI-II — UNI.

Hay un slice de vista previa en `apps/web`. `DESIGN.md` sigue en `draft` hasta aprobar lo que se ve.

## Desarrollo

Usar Node.js `22.23.2` (`.node-version`) y pnpm `11.22.0` (`packageManager`); pnpm 11 requiere Node >=22.13. El único lockfile es `pnpm-lock.yaml` en la raíz.

```bash
pnpm install --frozen-lockfile
pnpm --filter web dev
```

Rutas: `/` Landing, `/visor` shell del visor, `/equipo` plazas por confirmar.
La [API local](apps/api/README.md) requiere Go y PostgreSQL preparados;
allí están los comandos nativos, migraciones y Docker Compose. `pnpm dev`
coordina web y API cuando el entorno del backend está exportado.

## Verificación

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm --filter web exec next typegen
pnpm --filter web exec tsc --noEmit
pnpm --filter web build
```

`next typegen` genera los helpers de rutas usados por TypeScript en un checkout limpio.
Las tareas raíz incluyen Go; usar la versión de `.go-version`.
GitHub Actions exige web, contratos, Go/PostgreSQL y Docker mediante `ci-required`.
El build descarga fuentes de Google y las empaqueta para el runtime local offline.

## Documentación

Arquitectura objetivo: [diseño backend/local/cloud](docs/superpowers/specs/2026-10-01-cubeos-backend-design.md), [modelo de dominio Mermaid](docs/domain-model.md) y [plan de PRs](docs/superpowers/plans/2026-10-01-cubeos-backend.md). El frontend sigue siendo una vista previa. PR3 implementa identidad/dispositivos locales; ingestión, SSE, Clerk y medios siguen pendientes.

| Archivo | Contenido |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | Público, propósito, superficies y alcance |
| [DESIGN.md](DESIGN.md) | Contrato visual (`draft` hasta aprobar la preview) |
| [CONTEXT.md](CONTEXT.md) | Glosario de dominio |
| [docs/architecture.md](docs/architecture.md) | Capas, puerto de telemetría y monorepo |
| [docs/telemetry.md](docs/telemetry.md) | Contrato de datos |
| [docs/adr/](docs/adr/) | Decisiones aceptadas |
| [docs/open-questions.md](docs/open-questions.md) | Decisiones aún abiertas |
| [progress.md](progress.md) | Estado para la siguiente sesión |
| [AGENTS.md](AGENTS.md) | Contrato local para agentes |
