# Progreso — CubeOS

Actualizado: 2026-11-25.

## Dirección

Proyecto personal de portafolio, sin backend ([ADR 0007](docs/adr/0007-web-only.md)).
Roadmap en [docs/roadmap.md](docs/roadmap.md). Historial anterior (CHASQUI-II,
Go/PostgreSQL, PRs #9–#22) en el tag `legacy/cubeos-v1` y en git.

## PR 1 — Base solo web (rama `chore/web-only`)

- Eliminados: `apps/api`, `packages/api-client`, `packages/contracts`, `infra/`,
  `tools/`, Clerk, fotos, progreso remoto, rutas `/configuracion`, `/equipo`, `/lab`, `/healthz`.
- Visor y Armado funcionan solo con la DEMO. Landing sin CHASQUI/UNI.
- `Galaxy` ya no rompe la landing sin WebGL.
- Docs reescritos: README, PRODUCT, CONTEXT, AGENTS, ADR 0007, roadmap.
- Verificado: lint, typecheck, build (3 rutas estáticas), navegador en `/`, `/visor`, `/construccion`.

## Pendiente

- Revisar y fusionar PR 1. Publicar el tag `legacy/cubeos-v1` en GitHub.
- PR 2: definir diseño con Edwar (vistas, landing, motion, modelo).
- Sin tocar (cambios locales de Edwar): `delivery/design/`, `docs/frontend-local-roadmap.md`
  y `docs/superpowers/` sin seguimiento; son del diseño anterior.
