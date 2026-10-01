# Plan: documentación canónica y arquitectura frontend

**Fecha:** 2026-09-02
**Proyecto:** CubeOS (interface_cubesat)
**Tipo:** proyecto

## Resultado esperado

El repositorio usa la estructura documental del workspace. El producto, el glosario, el contrato de telemetría y la forma del monorepo quedan en un solo lugar cada uno. `DESIGN.md` existe en `draft` y espera referencias visuales.

## Por qué

La documentación previa era útil pero estaba repartida en índices y specs paralelas, fuera del contrato del workspace (`PRODUCT.md`, `DESIGN.md`, `CONTEXT.md`, `AGENTS.md`, `docs/adr/`). Sin esa base no se puede diseñar ni scaffold el frontend.

## Alcance

### Incluye

- Archivos canónicos en la raíz y `docs/`.
- Migración de ADRs y del contrato de telemetría.
- Copia de wireframes a `references/ui/`.
- ADR del monorepo pnpm.

### No incluye

- Scaffold de `apps/` o `packages/`.
- Tokens, paleta, tipografía o candidatos Shadcn/Motion/Magic UI.
- Cierre de las decisiones abiertas D-001 a D-006.
- Código de interfaz.

## Estado actual

Repo sin código. Fuente previa en `docs/Producto`, `docs/Arquitectura`, `docs/Frontend` y `docs/ADR`.

## Enfoque

Volcar lo útil a archivos canónicos, retirar duplicados y dejar `DESIGN.md` bloqueado en `draft` hasta que existan referencias visuales durables.

## Archivos previstos

| Archivo | Acción | Propósito |
|---|---|---|
| `AGENTS.md` | crear | Contrato local |
| `PRODUCT.md` | crear | Producto y superficies |
| `DESIGN.md` | crear | Contrato visual en draft |
| `CONTEXT.md` | crear | Glosario |
| `progress.md` | crear | Estado de sesión |
| `README.md` | modificar | Índice canónico |
| `PLAN.md` | crear | Este trabajo |
| `docs/adr/0001-stack-frontend.md` | crear | Stack frontend |
| `docs/adr/0002-sqlite-telemetry.md` | crear | Persistencia Sprint 2 |
| `docs/adr/0003-monorepo-multipaquete.md` | crear | Forma del monorepo |
| `docs/architecture.md` | crear | Capas y puerto |
| `docs/telemetry.md` | crear | Contrato de datos |
| `docs/open-questions.md` | crear | D-001 … D-006 |
| `references/ui/` | crear | Wireframes como evidencia de IA |

## Criterios de aceptación

- [x] Cada hecho tiene un dueño; no hay dos fuentes para el mismo dato.
- [x] PRODUCT cubre Visor, Construcción y Configuración, y el fuera de alcance.
- [x] DESIGN está en `draft` y `references/ui/` conserva los wireframes.
- [x] AGENTS apunta a PRODUCT, DESIGN, CONTEXT, ADRs, progress y al workflow web.

## Verificación

- Enlaces internos de README y AGENTS hacia los archivos canónicos.
- Conflicto 12 campos vs widgets extra de wireframes registrado en PRODUCT y `docs/open-questions.md`.

## Riesgos y decisiones pendientes

Identidad visual, umbrales, semántica de orientación y protocolo WebSocket siguen abiertos. Ver `docs/open-questions.md`.

## Aprobación

- [x] Requerida por alcance, riesgo o irreversibilidad
- [x] Aprobada por el usuario
