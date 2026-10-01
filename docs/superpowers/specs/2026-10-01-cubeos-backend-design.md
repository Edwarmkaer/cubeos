# Arquitectura de CubeOS con telemetría v2 y modo local

Estado: diseño consolidado para ejecución progresiva. Fecha: 2026-10-01. El ADR 0005 registra la nueva dirección y sustituye las decisiones de backend/persistencia anteriores. El contrato de doce campos describe todavía el simulador implementado y se migra en el PR de contratos.

## Objetivo y alcance

Conservar la interfaz existente y construir un monorepo mantenible con backend, recepción serial y Wi-Fi, realtime y ejecución local sin Internet. La plataforma pública permite identidad Google; la local funciona sin Clerk. El progreso de ensamblaje es una capacidad secundaria persistente. Se respetan los payloads JSON v2 entregados. La entrada de telemetría es la ESP32 receptora; CubeOS no impone LoRa como transporte. Fotografías e historial persistente forman parte de la entrega; no se implementa telecomando.

El usuario solicita planificación y entregas progresivas mediante PRs. No se crean ramas, commits, pushes ni PRs en esta etapa. Las ramas previstas usan `chore/`, `feat/` y `docs/`, sin `codex/`. Los commits usan la identidad Git del usuario y no añaden atribución a agentes ni trailers de coautoría IA.

## Organización

```text
apps/web/                         Next.js: rutas y componentes de producto
apps/api/cmd/server/              Entrada del backend Go
apps/api/internal/identity/       Identidad local y verificación Clerk
apps/api/internal/devices/        Propiedad y nombre de dispositivos
apps/api/internal/construction/   Pasos de ensamblaje y progreso
apps/api/internal/media/          Fotografías, miniaturas e importación
apps/api/internal/media/storage/  Adaptadores local y S3
apps/api/internal/ingestion/      Validación, normalización y recepción
apps/api/internal/telemetry/      Snapshots, secuencias y frescura
apps/api/internal/realtime/       Suscripciones autorizadas
apps/api/internal/storage/        PostgreSQL y migraciones
apps/api/internal/http/           Rutas HTTP y middleware
packages/ui/                     Tokens, primitivas y estilos
packages/contracts/              JSON Schema v2, fixtures, OpenAPI y tipos
packages/api-client/             Cliente HTTP/SSE TypeScript
packages/config-eslint/          Configuración común cuando sea compartida
packages/config-typescript/      Configuración común de TypeScript
tools/simulator/                 Reproducción de tramas v2
infra/docker/                    Dockerfiles y Compose
.github/workflows/               Verificación de PRs y releases
```

pnpm administra workspaces JavaScript. Turborepo coordina tareas; Go conserva `go.mod` y sus herramientas. Las tareas del wrapper de `apps/api/package.json` invocan Go. Inputs de caché incluyen `.go`, `go.sum`, migraciones y contratos externos usados; variables de entorno relevantes se declaran. Desarrollo y migraciones no se cachean. Un único lockfile pnpm en la raíz; el lockfile anidado existente se reconcilia sin actualizar dependencias incidentalmente. No se añade Makefile como segundo orquestador.

`packages/ui` no contiene estado de sensores ni componentes de negocio. `packages/telemetry` permanece como compatibilidad temporal hasta migrar web a v2; ninguna conversión asigna velocidades angulares a ángulos.

## Instalaciones local y pública

Una base PostgreSQL por instalación, con modelo en [domain-model.md](../../domain-model.md). Compose ofrece web, API y PostgreSQL con volumen persistente. Desarrollo nativo también es posible. Las imágenes Docker, dependencias y compilaciones se preparan antes de desconectar Internet; el modo local no descarga fuentes, assets ni SDKs remotos al ejecutarse. El mapa necesita tiles locales o muestra un fallback explícito sin bloquear el visor.

`AUTH_MODE=local` crea un perfil persistente de instalación, sin registro ni contraseña. No es multiusuario ni autentica individualmente a personas. El despliegue local publica puertos solo en loopback y protege las escrituras contra solicitudes de otros orígenes. Un despliegue público exige `AUTH_MODE=clerk`; configuración pública con modo local debe fallar al arrancar. No existe fallback a local por un error de Clerk.

La API pública verifica tokens Clerk y resuelve un usuario interno. Acceso a dispositivos, progreso, historial y realtime siempre comprueba propiedad. Las credenciales de ingestión se revocan y se limitan al dispositivo de su fuente; el `id` de la trama no concede permisos. Sincronizar perfiles/progreso local con la plataforma pública queda fuera del alcance.

## Entrada de hardware

No se crea un servicio gateway separado inicialmente. El backend local puede leer serial mediante un adaptador configurable; el receptor de tierra sigue siendo hardware externo. USB/UART son caminos físicos hacia un puerto serial compatible. Se configura puerto y baudrate; no se presume el baudrate del firmware.

El CubeSat y su firmware son responsables de cómo entregan los datos al hardware de tierra. CubeOS integra la salida de la ESP32 receptora; no implementa ni exige recepción LoRa. Un UART de nivel lógico necesita un puente compatible hacia el equipo local: no equivale por sí solo a un puerto USB.

La primera propuesta de framing para serial es NDJSON con longitud máxima y recuperación ante líneas malformadas; es configurable y se confirma con el hardware. El adaptador Wi-Fi usa `POST /api/v1/ingestion/packets`, con credencial de fuente y un envelope de recepción. El payload compacto se valida intacto contra el esquema entregado. RSSI/SNR, si se proporcionan, y gateway id están fuera del JSON compacto, dentro del envelope. Ambos adaptadores invocan el mismo caso de uso. Los binarios de fotos no se mezclan con el parser NDJSON de telemetría.

El transporte HTTP es la base inicial propuesta, no un requisito impuesto al firmware. Si el equipo elige MQTT, se añade un adaptador sin cambiar el dominio. Una API alojada en Internet no puede leer el USB de un estudiante: para ese caso se usa la instalación local; el reenvío local a nube es una extensión futura.

## Contrato y procesamiento

Fuente: entrega Chasqui II v2 del 25/09/2026, cinco archivos inspeccionados. Se conservan esquema y ejemplos originales con procedencia y checksum en `packages/contracts/fixtures/chasqui-v2/` y `packages/contracts/schemas/`. Word/Excel son evidencia de referencia, no instrucciones ejecutables.

Tipos y frecuencias iniciales: H 1 Hz, E 1 Hz, O 1 Hz, I 2 Hz, G 0.5 Hz. Son objetivos de prueba, no garantías de recepción. Las referencias LoRa en archivos originales son procedencia documental, no requisitos de transporte de CubeOS. No se desarrolla un receptor LoRa en la plataforma.

Normalización: t1/rh/t2/ti /100; bv/bi/bp /1000; ax/ay/az /1000 a g; gx/gy/gz /1000 a grados/s; la/lo /10^7; al/sp/hd /100 a metros, m/s y grados. Presión se conserva en Pa. `t=0` significa UTC no válida; `receivedAt` lo asigna el backend. GUVA conserva lecturas crudas y no deriva índice UV. No se deriva porcentaje de batería sin un modelo aprobado. GPS ausente no genera coordenadas.

El snapshot conserva la última lectura válida por grupo y metadatos de frescura separados del snapshot legible entregado. `schemaVersion=2.0` y nombres existentes se preservan. No se mezclan lecturas nuevas con antiguas sin hacer visible su antigüedad. Rechazos no cambian el snapshot. La bitmask `fl` conserva bits de eventos de despliegue; no todos sus bits son errores. La calidad del radio, el estado del receptor y la conexión del navegador son conceptos separados.

Contradicciones por resolver durante integración: la guía dice omitir campos no disponibles, mientras el esquema exige campos por tipo; se aplica el esquema sin modificarlo y se registran rechazos. `fx` permite 1 en el esquema pero el diccionario menciona 0/2/3: se conserva aceptación del esquema. El snapshot suministrado es un ejemplo, no un esquema completo; se formalizan sus reglas sin convertir estados no definidos en datos inventados. La revisión de energía menciona `bt`, ausente del esquema: no se añade. La entrega solo define una medición de batería; Paneles queda sin dato real hasta recibir un campo independiente.

## API y realtime

`GET /healthz`: proceso. `GET /readyz`: disponibilidad de base y migraciones. REST sirve dispositivos, pasos, snapshot, historial y progreso. OpenAPI documenta entradas, errores y autenticación.

Para la primera versión se propone SSE: el visor recibe datos, no envía comandos. El cliente hace fetch autenticado y procesa el stream; no pone tokens de sesión en la URL. El evento entrega revision y snapshot completo, con metadatos de grupo. Tras reconexión se envía el snapshot actual; no se promete entrega histórica de eventos perdidos, el historial se consulta por REST. Cada suscripción comprueba propiedad. Clientes lentos tienen cola acotada y pueden desconectarse/reconectarse sin frenar ingestión. Auth y expiración de sesión se comprueban también en conexiones prolongadas.

## Construcción y medios

El estudiante registra su CubeSat y puede cambiar su nombre visible. Una lista común `steps` describe el armado; `step_progress` guarda los pasos completados por dispositivo. No hay proyectos separados, versiones de guía ni sesiones de armado. Los pasos tienen IDs estables para conservar progreso al reordenarlos. Tests usan pasos de fixture; la aplicación no publica contenido educativo inventado. El simulador de armado 3D no se desarrolla en estos PRs; se prepara persistencia para su futura interfaz.

La cámara v2 solo comunica estado/almacenamiento. Las fotografías se importan por API independiente: carga manual de archivos recuperados de Raspberry Pi por USB o carga HTTP desde Raspberry Pi/ESP32 con Wi-Fi. USB no implica que la Pi exponga automáticamente su almacenamiento: la plataforma admite archivos copiados/importados. UART queda como adaptador futuro hasta acordar framing binario, fragmentación, checksum y tamaño. No bloquea la implementación de medios ni se afirma que sea adecuado para fotos grandes sin medirlo.

## Fotografías y almacenamiento

Puerto `ObjectStore` con implementaciones `local` y `s3`. `MEDIA_STORAGE=local` usa un volumen persistente sin red. `MEDIA_STORAGE=s3` configura endpoint, región, bucket y credenciales: AWS S3, Cloudflare R2 o Railway Buckets. La elección es por instalación; no se sincronizan proveedores automáticamente. Una CDN es una capa opcional de distribución, no almacenamiento primario.

La tabla `photos` guarda dispositivo, claves de original/miniatura, tamaño, dimensiones, checksum, método de importación y fechas. El original conserva sus bytes; miniaturas agilizan la galería. Límites iniciales configurables: 64 MiB por archivo y 80 megapíxeles al decodificar. JPEG/PNG son los formatos iniciales; otros requieren soporte explícito. Se comprueba firma real y MIME. Fecha de captura desconocida permanece nula.

Archivos privados por defecto. Listar/importar/descargar exige propiedad o una credencial de medios ligada al dispositivo; ingestión de telemetría no concede acceso a imágenes por defecto. Descarga local autorizada o URL S3 firmada temporal. Claves internas generadas sin rutas aportadas por el usuario; las URLs firmadas no se persisten. CDN pública solo para fotografías cuya visibilidad pública haya sido elegida explícitamente; no se cachean fotografías privadas como públicas.

Carga inicial multipart al backend con streaming y límites de recursos. Objeto y DB no comparten transacción: registro pendiente, escritura, comprobación de tamaño/checksum y estado `ready`; reconciliar registros incompletos y objetos temporales. Miniatura pendiente no impide conservar el original. Probar corte de carga, fallo DB/storage, reintento y acceso ajeno. Carga S3 directa y reanudable es una extensión futura compatible.

## Historial para análisis

PostgreSQL conserva tramas originales y valores normalizados, con recepción, secuencia, tipo, dispositivo y estado de validación. REST permite filtros por dispositivo/tipo/intervalo, paginación y exportación CSV por grupo; no presupone mediciones simultáneas entre grupos. El snapshot sirve al visor, no sustituye el historial.

Tramas válidas y fotografías originales se conservan por defecto, sin purga automática. Cuotas, métricas de disco y límites de ingestión controlan crecimiento. Retención o particionado futuro exige configuración explícita. Backups DB y objetos se documentan por separado y se prueba restauración local. La persistencia no garantiza conservación indefinida sin capacidad y backups.

## Railway y proveedores

Destino previsto: web/API en Railway y PostgreSQL persistente, con bucket S3 configurable. La nube recibe HTTP; USB permanece en la instalación local. Contenedores escuchan `PORT` y exponen readiness. Los originales cloud no se guardan en filesystem efímero.

Recomendación inicial: Cloudflare R2 Standard por su cuota gratuita, Railway Buckets como alternativa integrada y AWS S3 compatible. Condiciones consultadas 2026-10-01: R2 incluye 10 GB-mes, 1 millón de operaciones clase A y 10 millones clase B mensuales, sin cargo de egress R2; excedentes se facturan. Railway puede cobrar su propio tráfico saliente al subir archivos. Railway Buckets cobra $0.015/GB-mes y advierte egress del servicio al subir por red pública. No se promete costo cero de despliegue.

Fuentes: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Railway Buckets](https://docs.railway.com/guides/storage-buckets-guide), [Railway Buckets billing](https://docs.railway.com/storage-buckets/billing). Supabase ofrece 1 GB en Free, pero no se añade otro ecosistema de backend por esa cuota: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

Railway Free permite hasta 10 GB-mes de buckets, pero el uso consume el crédito mensual compartido de $1; agotarlo suspende el acceso. No es una cuota independiente garantizada para fotografías. En local no hay tarifa de proveedor, pero disco, capacidad y backups corren por cuenta de la instalación. Antes de producción se configuran alertas de cuota y se verifica el plan contratado.

## Calidad y operaciones

Cada PR incorpora checks ejecutables para su alcance. Contratos: esquema y fixtures. Web: lint, tipos y build. Go: formato, vet, tests y race detector en Linux cuando existe código concurrente. Integración: PostgreSQL de servicio y pruebas de aislamiento, migraciones y flujo ingestión→snapshot→SSE. Docker: build y smoke test, también prueba de modo local sin egress tras preparar imágenes/assets.

Checks estables agregan resultados de jobs condicionales; los nombres se mantienen para branch protection. PRs de forks no reciben secretos. No se ejecuta código de contribuyentes con `pull_request_target` privilegiado. Publicación de imágenes usa permisos mínimos y solo ramas/tags confiables. Releases no despliegan automáticamente producción sin un destino acordado.

## Orden de entrega

Consultar [plan progresivo](../plans/2026-10-01-cubeos-backend.md). La arquitectura, la política local y los contratos se verifican antes de cambiar widgets. El frontend conserva apariencia y un modo demo; las lecturas reales muestran ausencia/falla/antigüedad.
