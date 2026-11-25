# Progreso — CubeOS

Actualizado: 2026-11-25.

## Dirección

Proyecto personal de portafolio, sin backend ([ADR 0007](docs/adr/0007-web-only.md)).
Roadmap: [docs/roadmap.md](docs/roadmap.md). Historial anterior en el tag local
`legacy/cubeos-v1` (no publicado aún).

## Hecho (ramas locales apiladas, sin push)

1. `chore/web-only` — quita backend, auth, fotos y referencias a CHASQUI/UNI.
2. `feat/serial-telemetry` — `/conectar`: DEMO o USB (Web Serial), JSON/CSV/clave=valor,
   campos detectados, roles orientación/mapa, perfiles exportables. Visor generado y CSV.
3. `feat/custom-assembly` — Armado: pestaña ejemplo + "Mi proyecto" (GLB + guía MD/JSON,
   IndexedDB). Ejemplo en `apps/web/public/examples`, generado por `scripts/make-example-glb.mjs`.
4. `feat/esp32-example` — `firmware/esp32-telemetry` (sintético o MPU6050) + perfil.

Verificado: lint, typecheck, tests (`pnpm test`), build; navegador (DEMO, serial simulado
por JS) y 3D con Playwright + Chrome/swiftshader. Sin probar con una placa física; el sketch no se pudo compilar (descarga del toolchain ESP32 fallida).

## Siguiente

- Diseño con Edwar: referencias para la landing; luego shell/navegación móvil (la cabecera
  se aprieta en 390 px).
- Dev server: puerto 3100 (`.claude/launch.json`); el 3000 lo usa otro proyecto.
- Sin tocar: `delivery/design/`, `docs/frontend-local-roadmap.md`, `docs/superpowers/`
  (diseño anterior, cambios locales de Edwar).
