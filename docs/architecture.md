# Arquitectura del sistema

Estado 2026-10-01: web, UI compartida, contratos hardware v2 y simulador de
reproducción implementados. PR3 añade API Go local con identidad/dispositivos
persistidos en PostgreSQL; PR4 añade caso de uso de ingestión, historial y snapshots
reconstruibles con lecturas REST/CSV. PR5 añade serial y HTTP por fuente;
PR6 añade SSE autorizado y cliente TypeScript; auth pública sigue pendiente.
[ADR 0005](adr/0005-backend-local-cloud-media.md),
[diseño objetivo](superpowers/specs/2026-10-01-cubeos-backend-design.md),
[modelo de dominio](domain-model.md) y
[plan por PRs](superpowers/plans/2026-10-01-cubeos-backend.md) gobiernan esa entrega.
FastAPI/SQLite/WebSocket son antecedentes sustituidos.

## Bordes actuales

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Frontend | `apps/web` | Rutas Next.js, widgets y store Zustand |
| UI compartida | `packages/ui` | Primitivas y tokens, sin negocio de sensores |
| Demo de frontend | `packages/telemetry`, fuente en web | Muestra legacy sintética e historial breve |
| Contrato hardware | `packages/contracts` | Esquemas JSON, tipos y fixtures compartidos TS/Go |
| Reproducción | `tools/simulator` | Envelopes v1 deterministas NDJSON o fixtures con tiempo lógico |
| API local | `apps/api` | Health/readiness, identidad/dispositivos, snapshot/historial/CSV con propiedad |
| Ingestión | `apps/api/internal/ingestion` | Validación/normalización y transacción por fuente; adaptadores serial y HTTP |
| Telemetría | `apps/api/internal/telemetry` | Orden, proyección, procedencia por campo, consultas y reconstrucción |
| Realtime | `apps/api/internal/realtime` | Avisos transaccionales PostgreSQL, colas acotadas y SSE con autorización prolongada |
| Cliente API | `packages/api-client` | REST tipado y fetch SSE, contrato validado, cancelación y reconexión |
| Instalación local | `infra/docker` | Contenedores sin root, PostgreSQL persistente, publicación loopback y runtime verificado sin Internet |

Web todavía usa `TelemetrySource`/`simulatorSource`: el hook inicia y detiene la
fuente, el store mantiene `latest`, hasta 60 entradas de `history` y `connection`.
Los widgets no consumen directamente timers ni sockets. No se cambia la apariencia
ni el paquete legacy en PR2/PR3. La adopción de v2 por web corresponde al PR7.

pnpm coordina workspaces `apps/*`, `packages/*`, `tools/*`, con un lockfile raíz.
Turbo coordina lint/typecheck/build/test; tareas de test dependen de las de sus
paquetes productores. Los inputs por defecto incluyen esquemas, fuentes y fixtures:
cambiar contratos invalida consumidores. Desarrollo no se cachea. CI añade el job
`contracts`, `go-postgres` y `docker-local` al agregador `ci-required`, que exige éxito de todos y falla
también ante un job omitido/cancelado.

Los puertos de persistencia pertenecen a sus consumidores: HTTP consume
`DeviceStore` y `TelemetryStore`; ingestión consume `PacketRepository`, no un ORM
genérico. PostgreSQL aplica propiedad en cada consulta y lock por dispositivo
en ingestión/reconstrucción. Orden, épocas y evidencia tienen un único dueño en
[telemetría](telemetry.md). Operación, límites, entorno y
comandos de migración tienen su fuente en [API local](../apps/api/README.md).

## Flujo objetivo pendiente

```mermaid
flowchart LR
  Sat[CubeSat] --> Receiver[ESP32 receptora]
  Receiver -->|serial o HTTP| API[API Go]
  Replay[Simulador v2] -.->|envelopes de prueba| API
  API -->|validar y persistir| DB[(PostgreSQL)]
  API -->|REST y SSE autorizados| Client[Cliente web v2]
  Client --> Store[Store]
  Store --> Visor
  Contracts[packages/contracts] -.-> API
  Contracts -.-> Client
```

Ambos adaptadores invocan el mismo `Ingest`. Operación y separación LAN/gestión:
[transportes](hardware-transports.md). Payload compacto
intacto, metadatos externos y fuente/tiempo del servidor: [contrato y unidades](telemetry.md).
LoRa pertenece a la cadena de hardware documental; CubeOS no implementa un
receptor LoRa. NDJSON serial es una propuesta de framing pendiente con el firmware.

Una PostgreSQL por instalación conservará identidad, dispositivos, pasos,
progreso, tramas, snapshots y metadatos de fotos. Los archivos irán a almacenamiento
local persistente o S3; fotos y telemetría tienen transporte independiente.
Local y pública no se sincronizan. Perfil local sin Internet tras preparar
dependencias; Clerk en público, sin fallback de autenticación.

El snapshot será una proyección de últimas lecturas válidas por grupo, con
revisión y frescura fuera del objeto legible. REST/SSE comprobarán propiedad.
Ingestión, REST y SSE están operativos. El consumo del visor corresponde a PR7.
El hub recibe invalidaciones PostgreSQL solo después de commit; cada stream lee
la proyección actual con propiedad desde DB. Comportamiento de colas, tiempos,
reconexión y precisión del cliente tiene dueño en [realtime](realtime.md).
