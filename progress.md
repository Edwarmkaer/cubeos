# Progreso — CubeOS

Actualizado: 2026-10-01.

## PR 5 — Serial USB/UART y HTTP Wi-Fi

Base PR4 integrada: [PR #5](https://github.com/Edwarmkaer/cubeos/pull/5), merge
`3e4c2d0`. Rama `feat/hardware-transports`. Envelopes v1 NDJSON en reader/puerto
configurable y POST autenticado invocan el mismo Ingest. Aprovisionamiento y
revocación por propietario, secreto una sola vez/hash persistido, fuente ligada
al UUID y gateway registrado. Gestión conserva loopback; escucha privada opt-in
solo para ingestión. Operación y aceptación pendiente de hardware tienen dueño
en [transportes](docs/hardware-transports.md); API en [OpenAPI](packages/contracts/openapi/telemetry.yaml).

Red/green: adaptadores inexistentes, transportes CLI inexistentes, receiver null
aceptado indebidamente y arranque con puerto de ingestión ocupado devolviendo 0.
Verificación actual: Go formato/vet/race completo con tres bases exclusivas PR5,
sin skips; reader/PTY y HTTP/PG A/B con CS01 compartido, límites/metadata/revocado,
paridad de snapshot/historial y cuota de fuentes. CLI real TCP→Go→PG con escucha
separada, gestión inaccesible en ese borde y diez proyecciones validadas por TS.
Frozen install, lint/tipos/tests/build JS sin caché pasan. Docker build inicial
falló descargando módulos Go con HTTP2 INTERNAL_ERROR; reintento/smoke offline y
runners se reportan al publicar la entrega, no se dan por aprobados aquí.
Recursos exclusivos: `cubeos-pr5-test-pg`, puerto 55435 y volumen propio; Compose
`cubeos-pr5-smoke`, API 8085/web 3106. No se borran volúmenes. Evidencia ignorada
en `.superpowers/sdd/2026-10-01-cubeos-backend/pr5-*`. Frontend, fixtures originales
y DESIGN draft preservados. Revisión independiente y merge a cargo de raíz;
no avanzar PR6 desde este chat.

## PR 4 — Ingestión, historial y snapshots

PR3 integrado: [PR #4](https://github.com/Edwarmkaer/cubeos/pull/4), merge `94fb955`.
Rama `feat/telemetry-ingestion`. Validación Go del esquema hardware v2 intacto,
normalización con fixtures TS/Go, caso de uso por fuente registrada y recepción
raw trazable. PostgreSQL serializa dispositivo, evidencia, identidad lógica y
proyección en una transacción; snapshots con revisión y frescura por campo/grupo.
Lecturas REST/CSV paginadas con propiedad, cursor atado a filtros/dispositivo y
watermark estable. Política conservadora de orden/épocas y límites tienen su
dueño en [telemetría](docs/telemetry.md); rutas en
[OpenAPI](packages/contracts/openapi/telemetry.yaml). CLI local `fixture/rebuild`
en [API](apps/api/README.md), sin endpoint de transporte ni cambio de frontend.

Verificación local: Go race/vet/formato con tres bases exclusivas, fixtures y
rangos completos, rechazos, raw intacto/acotado, conflictos/duplicados, atraso,
wrap/reboot conservador, fallos transaccionales, concurrencia, reconstrucción,
API restart y REST/CSV A/B. Frozen install, lint/tipos/tests JS sin caché y build
web pasan. Docker verifica raw/historial/snapshot idénticos tras reinicio DB/API
con volumen, reconstrucción sin cambiar revisión y runtime preparado sin egress.
Runners del head final se reportan en el PR/chat; su evidencia
temporal queda ignorada en `.superpowers/sdd/2026-10-01-cubeos-backend`.
Revisión independiente y merge pertenecen al chat raíz. No avanzar PR5 aquí.

Corrección de revisión PR4: una recepción `late` puede mejorar valores/frescura
por campo sin mover cabecera global. Evidencia de estado ordenada por sensor
conserva fallas/fix posteriores, y barrera de reboot impide revivir épocas viejas.
Pruebas PG reproducen E100→I102→E101, grupos ausentes, opcionales parciales,
errores, GPS, wrap, rollback y rebuild idéntico; política en telemetría.

## PR 3 — API local y PostgreSQL

PR2 integrado: [PR #3](https://github.com/Edwarmkaer/cubeos/pull/3), merge `d7a14a2`.
Rama `feat/api-local-foundation`. API Go con principal local persistente, CRUD
de dispositivos con propiedad, nombre editable separado del identificador de
vuelo, migraciones versionadas/checksum y exclusión concurrente. Health separa
proceso de readiness. Modo público/auth local y Clerk todavía no implementado
fallan al iniciar; protecciones explícitas de Host/Origin y escrituras JSON.
Operación y límites: [README API](apps/api/README.md). Compose publica en loopback
y conserva PostgreSQL en volumen; puertos loopback, web/API sin root y prueba
de arranque sin egress con imágenes preparadas.
Web sigue con la demo y el mismo aspecto; solo añade salida Next standalone.
Ingestión/SSE/Clerk/progreso/fotos siguen pendientes en sus PRs.

Verificación Go/PostgreSQL real: configuración, nombres, propietario A/B en HTTP
y repositorio, identidad local concurrente/idempotente, migraciones paralelas,
rollback, checksum/versiones futuras y readiness con base caída. Runners del
head final y prueba Docker/offline/persistencia se reportan en este chat/PR.
Revisión independiente y merge corresponden a raíz; no avanzar PR4 aquí.

## PR 2 — Contratos y reproducción Chasqui v2

PR1 integrado: [PR #2](https://github.com/Edwarmkaer/cubeos/pull/2), merge `03c365d`.
Rama PR2: `feat/telemetry-v2-contracts`. `packages/contracts` conserva los tres
JSON originales byte a byte y documenta checksums/procedencia de la entrega;
Word/Excel solo se inspeccionaron localmente. Esquemas uplink/snapshot/envelope,
tipos y conversiones de referencia separados de la demo legacy. Frescura/revisión
quedan fuera del snapshot legible. ADR 0006 en propuesta para revisión.

TDD: validadores/normalizador y simulador se observaron fallar antes de implementar;
20 tests de contratos y 8 de simulador pasaron tras la corrección de revisión.
Se agregaron fixtures GPS fuera de G y ejes parciales: todas las claves conocidas
se convierten por presencia, conservando cero y sin rellenar valores ausentes.
Esquemas originales y snapshot completo no cambiaron. CLI determinista emite envelopes
NDJSON o JSON con tiempos lógicos: H/E/O/I, GPS opcional, duplicado, atraso,
reinicio y fallas. El escenario de fallas conserva una omisión inválida para
probar rechazo. CI añade `contracts` al `ci-required` que exige ambos jobs.

Verificación local: frozen install, 22 tests, lint, tipos y build pasaron;
enlaces internos resuelven. Se conserva la advertencia previa de Big Shoulders.
Runners del head final pendientes al escribir esta nota; evidencia final estará
en el PR y reporte del chat. Revisión independiente y merge
corresponden a raíz. Frontend/legacy sin cambios en PR2, backend
todavía pendiente; Railway/S3 no fueron desplegados ni creados.

## PR 1 — Workspace y UI compartida

PR 0 integrado: [PR #1](https://github.com/Edwarmkaer/cubeos/pull/1), merge `8638329`.
PR 1 abierto: [PR #2](https://github.com/Edwarmkaer/cubeos/pull/2),
`chore/monorepo-foundation`. Turborepo 2.10.11 coordina
`pnpm dev`, `pnpm build`, `pnpm lint` y `pnpm typecheck`; web genera los tipos de
rutas con `next typegen` antes de `tsc` también en un checkout limpio.

`@cubeos/ui` contiene las seis primitivas existentes, `cn` y la fuente única de
tokens, conservando props y presentación. Web transpila el paquete y Tailwind
incluye sus clases mediante `@source`. Los widgets/estado de telemetría permanecen
en web. El lockfile solo añade Turbo y los importers del workspace, sin upgrades
incidentales. Desarrollo es persistente y no cacheado; build excluye `.next/cache`
de sus outputs e incluye cambios de UI/tokens, `.env*` y `NEXT_PUBLIC_*` en el hash.

Verificación local: instalación frozen, lint, typecheck y build pasaron en
`/home/edwar/cubeos-verification/pr1-clean`, sin dependencias ni `.next` previos.
La repetición reutiliza la caché. Una modificación temporal de un token invalidó
build/lint/typecheck del consumidor web; el token fue restaurado. Landing y Visor
se compararon contra PR0 en navegador: las doce regiones del Visor conservan
geometría, fondo y radio; Landing conserva geometría, tipografía y colores.
Capturas y mediciones locales: `/home/edwar/cubeos-verification/pr1-visual/`. La telemetría, mapa y
atmósfera animada impiden una comparación literal de todos los píxeles.
Se conserva la advertencia previa de fallback de Big Shoulders. `DESIGN.md`
permanece en `draft`. Revisión independiente, CI real y merge corresponden al
chat raíz; los checks finales se consultan en el PR.

## Arquitectura y siguiente entrega

Frontend pausado para desarrollar backend. Diseño consolidado en [spec](docs/superpowers/specs/2026-10-01-cubeos-backend-design.md), [modelo](docs/domain-model.md) y [plan](docs/superpowers/plans/2026-10-01-cubeos-backend.md). Go/PostgreSQL, perfil local offline y Clerk público, pasos simples por dispositivo, fotos local/S3 e historial persistente. La entrada de telemetría es la ESP32 receptora; imágenes por importación/HTTP y futuro UART acordado con hardware. Railway es destino previsto, no despliegue realizado.

PR 0 integrado desde `chore/project-baseline`: [PR #1](https://github.com/Edwarmkaer/cubeos/pull/1). Base actual auditada, documentación canónica y referencias preservadas, un único lockfile raíz y CI Linux con `web`/`ci-required`. Remoto autorizado: `https://github.com/Edwarmkaer/cubeos.git`; `main` se inicializó con los dos commits documentales existentes, sin reescribir historia. La revisión independiente del chat raíz y los runners precedieron al merge. Ramas sin `codex/`, commits con identidad del usuario sin atribución IA. Ningún backend ni despliegue cloud se ha creado. Las notas siguientes conservan el estado de frontend de la sesión anterior; el WebSocket/FastAPI previsto allí fue sustituido por ADR 0005.

Evidencia PR 0: instalación frozen, lint, tipos y build pasaron sobre una copia limpia; el build se reintentó tras un fallo de red al descargar Google Fonts, sin cambiar código. El [run 36931280322](https://github.com/Edwarmkaer/cubeos/actions/runs/36931280322) verificó en runners reales `web` y `ci-required` para `c945a909192d016fa0b0539e211308dd938dbebf`. Los checks del head actual se consultan en el PR. Snapshot validado e inventario local: `/home/edwar/cubeos-snapshots/pr0-20261001T214329Z/`. Se conservan la advertencia previa de fallback de Big Shoulders y los espacios finales preexistentes del código; frontend, versiones y lockfile raíz permanecen idénticos al snapshot.

## Estado actual

Vista previa funcional de Landing, Visor, Equipo, Construcción y Configuración. La dirección Pozo sigue en `draft`: se puede iterar, pero todavía no es baseline aprobado.

El Visor consume un `TelemetrySource` simulado a 2 Hz y comparte última Muestra, historial y Conexión mediante Zustand. Los charts usan una gramática de línea común sin cambiar ninguno de los doce campos. GPS ya usa MapLibre GL JS con OpenFreeMap Dark y queda preparado para coordenadas del backend. En desktop conserva el tablero completo; en pantallas estrechas mantiene sus proporciones y permite desplazamiento horizontal.

## Cómo verlo

```bash
pnpm dev
```

Hover sobre el rail izquierdo en `/visor` para ver la magnificación. En móvil, el botón inferior abre la navegación de estación y el tablero se desplaza horizontalmente.

## Hecho en esta sesión

- Se corrigió la compresión ilegible del tablero en móvil y tablet.
- El shell vuelve a mostrar la Conexión `Simulado` y comparte el estado con el Visor.
- El simulador quedó detrás de `TelemetrySource`; Zustand conserva hasta 60 Muestras.
- GPS reemplazó el croquis por un mapa vectorial con marcador, trayectoria y estados de carga/error/espera.
- Telemetría muestra la Conexión con la estación terrena, frecuencia y última Muestra; ya no duplica temperatura.
- Los títulos del Visor ya no usan iconos; los charts tampoco usan retícula ni marcador final.
- CubeSat y Paneles comparten una región con dos indicadores de batería de igual tamaño, a la espera de definir los voltajes.
- Cámara quedó preparada como galería horizontal con Embla y un estado vacío honesto hasta recibir capturas.
- La atribución del mapa se muestra como texto sin botón de información; el control de seguimiento se ubica arriba a la izquierda.
- Las rutas de producto tienen landmark `main`, título accesible y navegación con `aria-current`.
- `/lab` usa `next/image` para la fotografía remota.

## Siguiente sesión

1. Recapturar Landing, Visor y Equipo en desktop y móvil.
2. Aprobar explícitamente la dirección aplicada y cambiar `DESIGN.md` a `approved`.
3. Seguir el plan progresivo Go/v2; la integración web REST/SSE corresponde a PR6/PR7.
