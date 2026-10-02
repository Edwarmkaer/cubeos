# Progreso — CubeOS

Actualizado: 2026-10-02.

## PR 10 — Fotografías privadas local/S3

Base PR9 integrada `26649d889d57f2dc12e288558cc4bc2b8f051662`; rama
`feat/photo-storage`, checkout nativo exclusivo. Operación y límites pertenecen a
[medios](docs/media.md); JSON/rutas a
[OpenAPI](packages/contracts/openapi/telemetry.yaml). Originales exactos/SHA,
captura desconocida nula, importación del servidor, miniaturas separadas,
metadata pending/ready y reconciliación por lotes rotativos. Credenciales de
medios revocables por dispositivo, distintas de telemetría; ingreso privado
solo upload. Galería conserva imágenes sin captions, miniaturas paginadas,
scrollbar oculta y descarga original. Cambios de cuenta/dispositivo/logout
cancelan y revocan blobs. Pozo y `DESIGN.md` draft se conservan.

RED→GREEN documentado para contrato local/S3, HTTP/cliente, aislamiento/sesión,
pool agotado por listas concurrentes y reconciliación tras cien cargas cortadas.
El overflow móvil provino del estado accesible sin contenedor posicionado:
diagnóstico 698→390 px al contenerlo, con bento 1152 px preservado; regresión
Next real verifica antes/después del scroll. Fixtures firmados no cargan CSS de
Next: sustituyen su wrapper de imagen y activan botones DOM; clic/responsividad
se verifican en Next real. Datos/PG/API/almacenamiento permanecen reales.

Recursos exclusivos: `cubeos-pr10-test-pg` (55440,
`cubeos-pr10-test-data`) y `cubeos-pr10-test-s3` (59040,
`cubeos-pr10-s3-data`), servidor S3 oficial RustFS fijado por digest;
Compose `cubeos-pr10-smoke` (8101/3135), volúmenes propios persistidos;
Next 3133/API browser 8102/fixture firmado 3134. Credenciales efímeras y
evidencia en `.superpowers/sdd/pr10-media/`, ignorada. No se modifican volúmenes
ajenos. CI media obligatorio y gates anteriores conservados. Handoff aporta
SHA y logs finales; runners/revisión/merge pertenecen al chat raíz.
Hardware, Google/Clerk externo y proveedor S3 cloud no fueron probados.
PR11/Railway no se inicia en esta entrega.

## PR 9 — Progreso de construcción

Base PR8 integrada `0bbdf00f06ac86385e920ad2c0b04820043e1225`; rama
`feat/construction-progress`, checkout nativo exclusivo. Operación, persistencia
y carga de contenido aprobado tienen dueño en
[construcción](docs/construction-progress.md); JSON en
[OpenAPI](packages/contracts/openapi/telemetry.yaml). Pozo se conserva y
`DESIGN.md` permanece draft. PR10/PR11 no se implementan.

RED→GREEN: rutas inexistentes en HTTP/PG, métodos ausentes del cliente,
controlador de sesión ausente y casilla ausente en navegador. Fixtures únicamente
en DBs descartables; JWT/JWKS/sesión efímeros sustituyen al proveedor externo,
manteniendo API/DB/propiedad reales. Regresiones: A/B en HTTP y repositorio,
pasos inexistentes, boolean/body estricto, dos CubeSats, reordenamiento, total
derivado, marcar/desmarcar/re-marcar y fechas. Navegador: recarga y GET/PUT tardíos,
cambio de dispositivo/cuenta y logout. Ruta Next real inspeccionada desktop/mobile
vacía y con fixture de prueba.

Verificación local: frozen install; 14 tareas JS lint/tipos/tests sin caché;
build web; Go vet/race con siete DBs propias; navegador local offline/telemetría,
auth firmado y construcción; CLI real; Docker con reinicio API/DB y volumen,
fechas/progreso persistidos, boot sin egress y gates anteriores conservados.
Runners y revisión independiente se informan por SHA en el handoff; esta nota
no declara checks remotos ni merge aprobados. Google/Clerk externo, guía
educativa real y hardware siguen sin probar.

Recursos propios: `cubeos-pr9-test-pg`, puerto 55439 y volumen
`cubeos-pr9-test-data`; Compose `cubeos-pr9-smoke` (8099/3129) y volumen propio;
web nativa 3127 y API browser 8097; fixture firmado 3128.
Evidencia ignorada en `.superpowers/sdd/pr9-progress/`. Ningún volumen ajeno
se modifica/elimina. Root conserva revisión independiente, CI exact SHA y merge.

## PR 8 — Identidad pública y permisos

Base PR7 integrada `d06f50e`; rama `feat/google-auth`, checkout nativo.
Clerk/Google condicional en web pública, getter en memoria, inscripción explícita
por CLI y RS256/JWKS/issuer/audience/azp/tiempos/sid en Go. Estado de sesión activo
ligado al subject, sin aceptar automáticamente identidades desconocidas ni caer
al perfil local. Operación/variables/setup tienen dueño en
[identidad pública](docs/public-auth.md); semántica de stream en
[realtime](docs/realtime.md). Pozo y DESIGN draft se preservan.

Regresiones RED→GREEN: config pública antes rechazada, verificador ausente,
token tardío de A después de B y abort inmediato SSE, límite público de stream.
Tests firmados generan claves efímeras, sin credenciales reales. HTTP/PG y
Chromium usan API y propiedad reales; sustituyen solo el proveedor externo.
Inscripción, A/B REST/snapshot/historia/CSV/SSE/fuentes, revocación/expiración,
lista/creación/token tardíos y logout tienen checks ejecutables. Se conserva
browser local sin egress y se añade auth-browser-isolation a ci-required.

Recursos propios: `cubeos-pr8-test-pg`, puerto 55438, volumen
`cubeos-pr8-test-data`; Compose smoke propio y puertos 8098/3120;
fixture browser 3118, runtime web 3119/3121–3124. No se tocan recursos PR7/otros
proyectos. Evidencia ignorada en `.superpowers/sdd/pr8-auth/`. El handoff reporta
comandos finales, SHA, capturas y runners reales; esta nota no declara aprobación
de checks pendientes. Google/Clerk externos y hardware físico siguen sin probar.
Raíz conserva revisión independiente, verificación final-SHA y merge protegido.
Este chat no inicia PR9–PR11.

## PR 7 — Visor con fuente real

Base PR6 integrada: [PR #7](https://github.com/Edwarmkaer/cubeos/pull/7), merge
`5aa48ec`. Rama `feat/visor-live-telemetry`. Estado real inicial pendiente;
Configuración selecciona DEMO/local/pública y UUID propietario desde REST con
registro/renombrado. `APIClient` entrega current snapshot/SSE; store cancela por
generación y separa demo, lectura v2, frescura y tendencias por campo. Operación
tiene dueño en [visor](docs/visor-telemetry.md); contrato original preservado.

Giro X/Y/Z °/s, UV crudo, cero legítimo, fallas/ausencia/edad independientes,
GPS con calidad válida y fallback offline. Actitud, SOC, Paneles y capturas reales
permanecen honestamente pendientes. API conectada y entrega del receptor son
conceptos separados. Pozo conserva bento, colores de charts, dos baterías iguales,
navegación y scroll horizontal móvil; `DESIGN.md` sigue draft. Landing/Equipo,
assets NASA y demo legacy no se rediseñan. Identidad pública falla cerrada sin
sesión; no se implementa PR8 ni medios PR10.

TDD: modelo ausente y API de sesión ausente→green; cambio de identidad con lectura
previa→red→green. Browser usa API/PG/simulador reales y detectó etiquetas ambiguas
y enlace cortado en Telemetría; corregidos dentro del pozo, con regresión de bounds.
Los comandos y capturas finales, Docker y runners se reportan por SHA al entregar,
sin afirmar que checks pendientes pasaron. Recursos exclusivos PR7: PG
`cubeos-pr7-test-pg`, puerto 55437, volumen `cubeos-pr7-test-data`; web nativa
3108/3109, API de prueba 8087. Evidencia ignorada `pr7-*` en workspace SDD.
Revisión independiente, CI exact SHA y merge corresponden al chat raíz.

Correcciones de revisión en la misma PR: reinicio confirmado con grupos
`unverified` y respuestas tardías en Configuración tuvieron regresiones rojas
antes del arreglo. Proyección API/PG, recuperación E/I, cancelación de creación/
lista y cambio de modo pasan en navegador; cambio de identidad borra UUID/nombre.
Semántica y operación siguen en [visor](docs/visor-telemetry.md). Revisión y CI
deben repetirse para el SHA corregido; el resultado del head anterior no lo valida.

## PR 6 — SSE y cliente API tipado

Base PR5 integrada: [PR #6](https://github.com/Edwarmkaer/cubeos/pull/6), merge
`94a166b`. Rama `feat/telemetry-realtime`. Hub con invalidaciones PostgreSQL
transaccionales y colas de una posición; SSE lee proyecciones autorizadas desde
DB, revalida dueño/sesión, acota operaciones/escrituras y se cancela en shutdown.
Cliente fetch REST/SSE con token por conexión, parser incremental limitado,
reconnect por estado actual, dedup int64 exacto y cancelación. Contrato en
OpenAPI; operación y límites tienen dueño en [realtime](docs/realtime.md).

Red/green: hub/SSE/endpoint/client inexistentes y timeout de stream silencioso.
PostgreSQL real propio prueba fuente HTTP→DB→SSE, dueño A/B, notices solo commit,
duplicados/rechazos/no-op/rollback, cambio de propietario y reconnect. Race y
TCP lento verifican limpieza/deadline sin bloquear otro dispositivo. CLI real
TCP→Go→PostgreSQL→cliente SSE verifica revisión final y monotonicidad. La suite
completa y Docker/runners se informan por SHA en la entrega; esta nota no afirma
que un runner pendiente haya pasado. Frontend/demo/fixtures/DESIGN draft intactos.
Recursos exclusivos PR6: PostgreSQL `cubeos-pr6-test-pg`, puerto 55436, volumen
`cubeos-pr6-test-data`; evidencia ignorada `pr6-*` en el workspace SDD. No se
borran volúmenes. Revisión independiente y merge corresponden al chat raíz.
No iniciar PR7 ni afirmar hardware físico probado desde este chat.

Corrección PR6: las colas del hub normalizan únicamente la clave UUID de
dispositivo. Alias de URL en mayúsculas reciben el NOTIFY canónico de PostgreSQL
sin esperar heartbeat; el ID SSE conserva el UUID solicitado y el cliente lo
comprueba exactamente. Identidad/bearer no se normalizan. Regresión PG red sin
normalización→green, dos streams simultáneos y CLI tipado con UUID uppercase.

Corrección de revisión PR6: un corte TCP durante body REST HTTP 200 se clasifica
como fallo de transporte reintentable. Catch limitado a `reader.read`: abort,
UTF-8, JSON, esquema y Content-Type mantienen su comportamiento terminal/cancelable.
Regresión TCP real red→green prueba token fresco, latest REST + dedup SSE,
cancelación de body pendiente y cierre de conexión; UTF-8 inválido no reintenta.

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

Correcciones de revisión PR5: envelope/receiver validan claves exactas antes del
decoder Go, evitando aliases case-insensitive y sobrescritura de RSSI. Serial
acota cada escritura/evidencia y lookup de fuente a 5 s; el worker conserva vida
independiente y recupera con backoff. Regresiones red/green reproducen variantes
inválidas y locks PostgreSQL; esquema TS coincide, inválidos auditados no cambian
proyección. Verificación del nuevo SHA/run se reporta al entregar corrección;
el CI previo `36953752686` corresponde exclusivamente a `5a8196a`.
Const numérica del envelope acepta 1.0/1e0 por comparación racional exacta con
exponente acotado; no coerciona strings ni redondea números diferentes a 1.

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
