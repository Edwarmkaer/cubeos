# CubeOS

Plataforma web educativa de estación terrena para CubeSat. Pertenece al grupo CHASQUI-II — UNI.

Hay un slice de vista previa en `apps/web`. `DESIGN.md` sigue en `draft` hasta aprobar lo que se ve.

## Desarrollo

Usar Node.js `22.23.2` (`.node-version`) y pnpm `11.22.0` (`packageManager`); pnpm 11 requiere Node >=22.13. El único lockfile es `pnpm-lock.yaml` en la raíz.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Rutas: `/` Landing, `/visor` shell del visor, `/equipo` plazas por confirmar.

## Verificación

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm --filter web exec next typegen
pnpm --filter web exec tsc --noEmit
pnpm --filter web build
```

`next typegen` genera los helpers de rutas usados por TypeScript en un checkout limpio. GitHub Actions ejecuta estos checks en Linux y publica `ci-required` como resultado obligatorio. El build actual descarga las fuentes de Google; la ejecución local offline se prepara en los PRs posteriores.

## Documentación

Arquitectura objetivo: [diseño backend/local/cloud](docs/superpowers/specs/2026-10-01-cubeos-backend-design.md), [modelo de dominio Mermaid](docs/domain-model.md) y [plan de PRs](docs/superpowers/plans/2026-10-01-cubeos-backend.md). El frontend actual sigue siendo una vista previa; estos documentos no implican que el backend ya esté implementado.

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
