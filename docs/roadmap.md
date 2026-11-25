# Roadmap

Trabajo en local con ramas apiladas; se publica en Vercel al cerrar el bloque UI.

| # | Rama | Contenido | Estado |
| --- | --- | --- | --- |
| 1 | `chore/web-only` | Base solo web, sin backend ni CHASQUI/UNI | hecho |
| 2 | `feat/serial-telemetry` | Web Serial, parsers, perfiles, Conectar, Visor desde perfil, CSV | hecho |
| 3 | `feat/custom-assembly` | Armado cargable: GLB + guía JSON/MD, piezas, conceptos | hecho |
| 4 | `feat/esp32-example` | Firmware ESP32 de ejemplo + perfil | hecho |
| 5 | — | Diseño con Edwar: referencias, landing, shell, motion | siguiente |
| 6 | — | Landing nueva | pendiente |
| 7 | — | Shell y navegación (móvil incluido) según diseño aprobado | pendiente |
| 8 | — | Publicar en Vercel | pendiente |

Ideas posteriores: adaptador WebSocket, vista explosionada en proyectos propios,
exportar/importar proyecto de armado como `.zip`.

Estado anterior (Go, PostgreSQL, auth, fotos): tag `legacy/cubeos-v1`.
