# CubeOS — contexto local

Este archivo extiende el `AGENTS.md` del workspace. Incluir únicamente información
específica del proyecto.

## Propósito

Actualización 2026-10-01: para el trabajo nuevo de backend prevalece [ADR 0005](docs/adr/0005-backend-local-cloud-media.md) y el [plan progresivo](docs/superpowers/plans/2026-10-01-cubeos-backend.md). Go/PostgreSQL/local-S3 sustituyen el backend FastAPI/SQLite previsto abajo. El usuario abrió la etapa backend; las restricciones de no crear `apps/api` solo corresponden al slice anterior. No usar ramas `codex/` ni atribución IA en commits. Mantener el frontend actual mientras se migra el contrato v2.

CubeOS es la plataforma web educativa para visualizar la telemetría de un CubeSat, guiar su
construcción y configurar la fuente de datos. El público son estudiantes de
ingeniería y el grupo CHASQUI-II — UNI, dueño de CubeOS.

## Stack

- Monorepo pnpm: `apps/web` ahora; `apps/api` en Sprint 2; `packages/telemetry` como contrato compartido.
- Frontend: Next.js (App Router) + pnpm, Zustand, Tailwind CSS. Ver [docs/adr/0004-nextjs-app-router.md](docs/adr/0004-nextjs-app-router.md).
- Visualización (después del gate estático): Three.js + React Three Fiber + Drei, Recharts, React-Leaflet.
- Backend futuro: FastAPI, WebSocket, SQLite + SQLAlchemy. Ver [docs/adr/0002-sqlite-telemetry.md](docs/adr/0002-sqlite-telemetry.md).
- Cadencia de telemetría: 2 Hz. Contrato en [docs/telemetry.md](docs/telemetry.md).

Hay un slice de **vista previa** en `apps/web` (Landing, Visor shell, Equipo). Dirección actual: **Pozo**. `DESIGN.md` sigue en `draft` hasta que se apruebe lo que se ve. No añadir 3D, datos vivos ni `apps/api` en este slice.

## Comandos

- Desarrollo: `pnpm dev` (Next.js en `apps/web`; si 3000 está ocupado, usa el puerto que imprima el CLI)
- Build: `pnpm --filter web build`
- Lint: `pnpm lint`

## Mapa del proyecto

- `PRODUCT.md` — producto, superficies y alcance.
- `DESIGN.md` — contrato visual. Hoy está en `draft`.
- `CONTEXT.md` — glosario de dominio.
- `progress.md` — estado para la siguiente sesión.
- `docs/architecture.md` — capas, puerto de telemetría y flujo.
- `docs/telemetry.md` — campos, unidades y persistencia.
- `docs/open-questions.md` — decisiones no resueltas.
- `docs/adr/` — decisiones aceptadas.
- `references/ui/` — evidencia visual durable (wireframes de IA).

## Documentación canónica

- Producto: `PRODUCT.md`
- Diseño web: `DESIGN.md`
- Dominio: `CONTEXT.md`
- Arquitectura: `docs/architecture.md`
- Telemetría: `docs/telemetry.md`
- Decisiones: `docs/adr/`
- Estado: `progress.md`

Un hecho vive en un solo archivo. Si dos documentos se contradicen, prevalece el más cercano al tema (PRODUCT para alcance, DESIGN para visual, telemetry para campos, ADR para stack).

## Verificación requerida

Para cambios de documentación: cada hecho tiene un dueño, los enlaces internos resuelven y `DESIGN.md` no pasa a `approved` sin referencia visual durable y aprobación explícita.

Para UI web, además de `agent-kit/web/STANDARD.md`: composición estática inspeccionada en navegador antes de instalar Three.js, GSAP u otra capa de canvas.

## Skills relevantes

- `impeccable` al diseñar, implementar o revisar la interfaz.
- `reference-driven-ui` cuando existan referencias visuales dominantes.
- `domain-modeling` al cambiar términos de `CONTEXT.md` o añadir ADRs.

## Reglas por dominio

Aplica `agent-kit/web/WORKFLOW.md` y `agent-kit/web/STANDARD.md`. No pasar `DESIGN.md` a `approved` sin aprobación explícita de la vista previa en el navegador.

Shadcn sigue disponible para controles. La grilla Magic UI y la órbita Motion no forman parte de Pozo. `/lab` es archivo de exploración.

## Excepciones

- El visor 3D está previsto (ADR 0004) pero el workflow web prohíbe instalar WebGL en el primer slice. El 3D entra en un cambio posterior, con fallback y `prefers-reduced-motion`.
- FastAPI, SQLite y WebSocket se documentan para Sprint 2. No se crean en el Sprint 1.
- Los wireframes en `references/ui/` son arquitectura de información, no identidad visual. No copiar el trazo sketch ni tratarlo como skin.
