# CubeOS — contexto local

Este archivo extiende el `AGENTS.md` del workspace. Incluir únicamente información
específica del proyecto.

## Propósito

CubeOS es el proyecto personal de portafolio de Edwar: una estación de tierra web
sin backend. Lee telemetría de una placa (Web Serial, perfiles configurables) y
guía el armado de un modelo 3D cargado por el usuario. Ya no pertenece a
CHASQUI-II ni a la UNI: no usar esos nombres. Decisión: [ADR 0007](docs/adr/0007-web-only.md).
El estado con backend Go queda en el tag `legacy/cubeos-v1`.

## Stack

- Monorepo pnpm + Turbo: `apps/web`, `packages/ui`; `firmware/` con sketches Arduino.
- Next.js (App Router), Tailwind, Zustand, three + React Three Fiber + drei.
- Despliegue estático en Vercel, solo cuando Edwar lo pida.

## Comandos

- Desarrollo: `pnpm dev`
- Verificación: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`

## Mapa del proyecto

- `PRODUCT.md` — producto, superficies y alcance.
- `DESIGN.md` — contrato visual (`draft`).
- `CONTEXT.md` — glosario.
- `docs/roadmap.md` — PRs previstos.
- `docs/adr/` — decisiones.
- `progress.md` — estado para la siguiente sesión.

Un hecho vive en un solo archivo.

## Verificación requerida

Para cambios de documentación: cada hecho tiene un dueño, los enlaces internos resuelven y `DESIGN.md` no pasa a `approved` sin referencia visual durable y aprobación explícita.

Para UI web, además de `agent-kit/web/STANDARD.md`: inspeccionar en navegador (desktop y móvil) y aprobar la composición estática antes de añadir motion nuevo.

## Skills relevantes

- `impeccable` al diseñar, implementar o revisar la interfaz.
- `reference-driven-ui` cuando existan referencias visuales dominantes.
- `domain-modeling` al cambiar términos de `CONTEXT.md` o añadir ADRs.

## Reglas por dominio

Aplica `agent-kit/web/WORKFLOW.md` y `agent-kit/web/STANDARD.md`. No pasar `DESIGN.md` a `approved` sin aprobación explícita de la vista previa en el navegador.

Shadcn sigue disponible para controles. La grilla Magic UI y la órbita Motion no forman parte de Pozo. `/lab` es archivo de exploración.

## Reglas del proyecto

- No usar ramas `codex/` ni atribución IA en commits.
- Respuestas al usuario cortas y al grano.
- El navegador integrado no tiene WebGL: verificar 3D con Playwright + Chrome.
