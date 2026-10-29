# Convex, relay y fuente cloud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution after Edwar reviews this plan. Steps use checkbox syntax for tracking.

**Goal:** Replicar la última lectura confirmada localmente y verla sin login en el Visor, con acceso temporal separado de publicación.
**Architecture:** Go/PostgreSQL sigue siendo dueño de ingestión/normalización. Relay opt-in HTTPS a Convex; suscripción del navegador al canal autorizado. Fallar cloud nunca detiene ingestión local.
**Tech Stack:** Go existente, TypeScript, Convex, convex-test, React/Zustand existente, pnpm/Turbo. Resolver y fijar versiones exactas antes de instalar; no usar rangos ni latest en CI.
**Spec:** [Recepción primero](../specs/2026-10-29-cubeos-telemetry-first-design.md).

## Global Constraints

- Sin Clerk, alias, progreso, fotos/historial cloud ni rediseño del Visor.
- Payload v2 y sus unidades no cambian. Int64 se transporta como cadena decimal.
- Máximo un envío/s con nueva revisión; cola de tamaño uno. Timeout 5 s,
  backoff 1/2/4/8/16/30 s; sin redirects; 401/403 suspenden envío.
- Dos credenciales independientes de 32 bytes aleatorios, solo hashes cloud,
  TTL de ocho horas; no tokens en URL, Git, argumentos de procesos ni logs.
- No mezclar bases/volúmenes ni cambios Pencil. No merges sin petición explícita.

## Review Focus

1. Revisiones mayores que 2^53: comparar por BigInt/cadena, nunca Number (tareas 1/3).
2. Acceso A/B, vencimiento/revocación con navegador abierto (tareas 2/3).
3. Cloud lento/caído/credencial revocada: serial y DB siguen avanzando (tarea 3).
4. Restore, revisión regresiva o igual con contenido distinto: no sobrescribir nube (tareas 2/3).
5. Local offline sin URL Convex: no instanciar cliente cloud ni cargar secretos (tarea 3).

## Task 1: contrato y validación portable

**Files:** crear `packages/contracts/schemas/cloud-replica-v1.json`,
`packages/contracts/src/cloud-replica.ts`, `packages/contracts/tests/cloud-replica.test.ts`,
`packages/contracts/scripts/generate-cloud-validator.mjs`; modificar exports/scripts
de contracts y `packages/api-client/src/client.ts` con sus tests.
**Interfaces:** `CloudReplicaV1 = {replicaVersion:1, channelId:string,
deviceId:string, revisionId:string, snapshot:SnapshotV2,
freshnessByGroup:SnapshotProjectionV2["freshnessByGroup"]}`;
`parseCloudReplica(value:unknown):CloudReplicaV1` rechaza extras/versión inválida.
`SnapshotEvent` conserva revisionId como única revisión de aplicación; REST
puede seguir enviando el entero existente, leído por su lexema sin redondearlo.

- [ ] Tests RED: 9007199254740993/9223372036854775807 exactos, cero/overflow,
  campos/unidades inválidos, claves extra, UUID/canal incorrecto y frescura inválida.
- [ ] Generar validador estático desde esquemas canónicos con Ajv standalone;
  exportarlo sin importar el índice que compila Ajv dinámicamente en Convex.
  No mantener una segunda descripción manual del snapshot.
- [ ] GREEN: `pnpm --filter @cubeos/contracts test` y
  `pnpm --filter @cubeos/api-client test`; comprobar regeneración sin diff.
- [ ] Commit: `feat: define lossless cloud replica contract`.

## Task 2: backend Convex y aprovisionamiento administrativo

**Files:** crear `packages/cloud/package.json`, `convex.json`, `tsconfig.json`,
`convex/{schema,convex.config,http,channels,replicas}.ts`, `tests/*.test.ts`,
`tools/cloud/channel.mjs`, `tools/cloud/channel.test.mjs`; modificar lockfile y
workspace/CI solo para incorporar este paquete y su gate.
**Interfaces:** HTTP `POST /telemetry/v1/snapshot`, Authorization Bearer publicación;
consulta pública `replicas.latest({channelId,readToken})`; internas
`channels.provision({channelId,deviceId,protocolDeviceId,publishHash,readHash,expiresAt})`,
`channels.revoke({channelId})`, `channels.expire({channelId})`.
Tablas `channels` y `replicas`, ambas indexadas por channelId, una proyección por canal.
Provisionar solo mediante cliente administrativo autenticado; no endpoint abierto.

- [ ] RED con convex-test: A/B aislados, tokens intercambiados, falta/revocación/TTL,
  cuerpo >64 KiB (incluido streaming), snapshot inválido sin escrituras,
  duplicado exacto idempotente, revisión menor/igual diferente rechazada.
- [ ] Implementar autorización y validación dentro de la operación que escribe;
  usar índices y args/returns explícitos. Incorporar componente oficial
  rate-limiter, token bucket 1/s con burst 1 por canal; 429 conserva snapshot.
- [ ] Programar expiración interna al vencimiento para invalidar también consultas
  abiertas; read solo devuelve datos/situación del canal, nunca hashes ni tokens.
- [ ] CLI genera dos archivos privados 0600 independientes (lector y consulta),
  no sobrescribe archivos/symlinks y solo envía hashes en llamada administrativa.
  Probar permisos, fallos parciales y ausencia de secretos en salida.
- [ ] GREEN: `pnpm --filter @cubeos/cloud test` y typecheck; generar código Convex
  con CLI, nunca inventar `_generated`. Gate unitario sin secretos en cada PR.
- [ ] Commit: `feat: add restricted Convex telemetry channels`.

## Task 3: relay Go, runtime opt-in y adaptador del Visor

**Files:** crear `apps/api/internal/cloudrelay/{config,relay,relay_test}.go`,
`apps/api/internal/cloudrelay/postgres_test.go`, `infra/docker/compose.cloud.yaml`,
`tools/runtime/cloud.mjs` y tests, `apps/web/src/lib/cloud-source.ts` y tests;
modificar `apps/api/cmd/server/main.go`, crear su `relay.go` y tests administrativos,
modificar `infra/docker/Dockerfile.api`, configuración Go, runtime config/index,
`apps/web/src/lib/telemetry-{store,source}.ts`, `apps/web/src/app/configuracion/page.tsx`,
`apps/web/src/lib/auth-config.ts`, `apps/web/src/components/auth-boundary.tsx`,
`apps/web/src/app/healthz/route.ts` y sus tests,
`apps/web/tests/browser-cloud.mjs`, dependencias web y `.github/workflows/ci.yml`.
**Interfaces:** `cloudrelay.Run(ctx, Reader, Publisher, Options) error`;
`Reader.Latest(ctx) (Replica,error)` usa `telemetry.Repository.GetSnapshot`
con principal local y dispositivo esperado. `Publisher.Publish(ctx,Replica)`
devuelve accepted/duplicate/unauthorized/stale; no controla el commit serial.
`pnpm cloud:enable -- --config ARCHIVO` / `pnpm cloud:disable`; host valida archivo
0600 y transmite solo publicación por stdin a `server prepare-relay`.
Este comando escribe configuración 0600 dentro de volumen propio con dueño UID
10001; API lo monta read-only. No bind del archivo 0600 del host que UID 10001
no podría leer, ni secreto en Compose env/argv. Disable elimina solo ese archivo
mediante comando administrativo y reinicia API sin relay, conservando datos/fotos.
Fuente `mode:cloud` explícita y credencial de lectura en memoria, fuera de persistencia.

- [ ] RED Go con reloj/HTTP controlados: 100 actualizaciones confluyen en última,
  1 Hz máximo, cancelación, 5xx/timeout sin backlog, redirects sin credencial,
  401/403 suspendido, revisión menor remota exige nuevo canal, no envío estando off.
- [ ] RED runtime: token file 0600, rechazo symlink/dispositivo distinto,
  ausencia de exportación cloud por defecto, enable/disable sin borrar DB ni fotos.
  Preparación desde stdin no imprime secretos; el UID de API puede leer el archivo
  provisionado y web/DB no montan el volumen. Sin reintentar con root ante error.
- [ ] RED navegador: local sin env cloud no rompe; A→B/logout elimina datos previos;
  mensajes tardíos se descartan por generación; TTL/revocación bloquean acceso;
  silencios mantienen timestamps originales y no caen a DEMO.
- [ ] Implementar polling de la proyección confirmada a 1 Hz y outbox acotado;
  persistir binding del canal/instalación. Un canal nuevo requiere activación
  explícita; restore regresivo no se repara adoptando otro canal automáticamente.
  Endpoint solo HTTPS, hostname de deployment `*.convex.site`, sin userinfo,
  puerto no estándar, query ni fragmento; tests de orígenes engañosos/redirects.
- [ ] Instanciar cliente Convex solo al elegir cloud con URL pública válida;
  usar suscripción reactiva, no polling browser ni Vercel→localhost.
  Mantener controles/tokens existentes de packages/ui, sin rediseño.
- [ ] Añadir modo de despliegue web `cloud` sin Clerk, separado de `local` y del
  modo anterior `public` que conserva validación Clerk fail-closed. Health cloud
  requiere URL Convex válida; el despliegue cloud no ofrece conexión automática a
  localhost ni endpoints locales de gestión. El runtime local no necesita esa URL.
- [ ] GREEN: Go race incluyendo PostgreSQL exclusivo; tests runtime/contracts/client/
  cloud/web; lint/typecheck/build; repetir el gate local-reader para probar aislamiento.
- [ ] Commit: `feat: connect local telemetry to the cloud viewer`.

## Task 4: revisión y entrega del PR

**Files:** `docs/cloud-telemetry.md`, `progress.md`, CI y registro de evidencia.
- [ ] Documentar habilitación/parada y retirada de archivos propios; advertir
  que 1 Hz son hasta 3600 publicaciones/h, no historial sincronizado.
- [ ] Revisión independiente final, corregir importantes con RED→GREEN y repetir suite.
- [ ] Abrir PR `feat/cloud-telemetry` sobre la entrega local, adjuntarlo y esperar
  todos los runners del SHA final. Sin merge, sin anunciar nube desplegada aún.
