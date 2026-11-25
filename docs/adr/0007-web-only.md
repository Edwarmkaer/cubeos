# ADR 0007 — CubeOS solo web, sin backend

Fecha: 2026-11-25. Estado: aceptada. Sustituye a las ADR 0002, 0005 y 0006.

## Contexto

CubeOS nació como estación terrena del grupo CHASQUI-II (UNI) con API Go,
PostgreSQL, almacenamiento S3, autenticación y despliegue en Railway. El autor
ya no participa en ese grupo y rescata el software como proyecto personal de
portafolio. Ese backend añadía mucha operación para poco valor visible.

## Decisión

- CubeOS es una aplicación web estática (Next.js) desplegable en Vercel.
- La telemetría entra por el navegador (Web Serial; otros adaptadores después).
  La forma de los datos se define en un perfil configurable, no en un contrato fijo.
- El armado 3D carga el modelo y la guía del usuario (GLB + JSON/Markdown).
- Los datos del usuario viven en su navegador y se exportan como archivos.

## Consecuencias

- Se elimina del código activo: `apps/api`, `packages/api-client`,
  `packages/contracts`, `infra/`, `tools/dev`, `tools/simulator`, auth y fotos.
- El estado anterior queda en el tag `legacy/cubeos-v1`.
- Web Serial solo funciona en navegadores Chromium; el resto usa la DEMO.
