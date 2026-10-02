# CubeOS web

Frontend Next.js con fuentes empaquetadas durante la compilación, tokens Pozo
compartidos y demo legacy separada del visor v2. Inicio y selección de fuente,
dispositivo, límites, semántica y prueba en navegador:
[operación del visor](../../docs/visor-telemetry.md).
Guardado por CubeSat y preparación de la guía:
[construcción](../../docs/construction-progress.md).

Desde la raíz: `pnpm dev`, `pnpm --filter web build`, `pnpm --filter web test`,
`pnpm --filter web lint`, `pnpm --filter web typecheck`.

## Fotografías privadas

Configuración importa JPEG/PNG para el dispositivo seleccionado. Cámara usa
miniaturas paginadas y descarga el original al pulsar una imagen. Operación,
límites y aislamiento se documentan en [medios](../../docs/media.md).
