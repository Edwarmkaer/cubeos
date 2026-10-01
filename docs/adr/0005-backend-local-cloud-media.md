# Backend Go y persistencia local y pública

**Status:** accepted para la arquitectura objetivo; implementación pendiente por PRs.

CubeOS usará Go para API/ingestión/realtime, PostgreSQL por instalación para usuarios, pasos, dispositivos, fotografías y telemetría, y almacenamiento de objetos configurable local/S3 para originales y miniaturas. Esto sustituye la elección FastAPI/SQLite del ADR 0002 y amplía el ADR 0003 con pnpm/Turborepo y UI compartida. La estructura de monorepo y Next.js del ADR 0004 se conservan.

La ESP32 receptora entrega la telemetría; el payload JSON v2 es independiente del transporte. Fotografías admiten importación de archivos y HTTP, conservando un borde para futuros transportes UART sin imponerlos. El modo local funciona sin Clerk ni Internet tras preparar dependencias; la plataforma pública usa Clerk/Google. Railway es el destino cloud previsto y R2 es el bucket inicial recomendado, intercambiable con Railway Buckets/AWS S3. Las instalaciones no se sincronizan automáticamente.

PostgreSQL simplifica relaciones y análisis en un solo motor; los archivos fuera de DB evitan mezclar grandes binarios con consultas de historial. El coste es preparar PostgreSQL incluso en local. El estado de construcción se limita a `steps` y progreso por dispositivo. Diseño completo: [spec](../superpowers/specs/2026-10-01-cubeos-backend-design.md). Entregas y pruebas: [plan](../superpowers/plans/2026-10-01-cubeos-backend.md).
