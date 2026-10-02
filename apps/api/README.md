# API local (PR3–PR4)

Go 1.27.1 (misma versión en `.go-version`, `go.mod`, Docker y CI), PostgreSQL
17.6. Persiste identidad/dispositivos, recepciones e historial de telemetría y
snapshots reconstruibles. La web conserva su demo; todavía no consume esta API.
Los adaptadores de ingestión, SSE, Clerk, progreso y medios pertenecen
a los PRs siguientes del [plan](../../docs/superpowers/plans/2026-10-01-cubeos-backend.md).

## Desarrollo nativo

Instalar Go de [la distribución oficial](https://go.dev/dl/), preparar pnpm e
iniciar PostgreSQL propio. Exportar las variables de `.env.example` en el shell
(Go no carga `.env` automáticamente). No usar una base de producción en tests.

```sh
pnpm install --frozen-lockfile
pnpm --filter @cubeos/api migrate
pnpm --filter @cubeos/api dev
```

Por defecto escucha `127.0.0.1:8080`. `/healthz` comprueba el proceso; `/readyz`
comprueba conexión y versiones/checksums de migraciones. La API no migra al
arrancar. Sin migraciones, las rutas de negocio devuelven 503. `migrate` aplica
todo en una transacción bajo advisory lock de PostgreSQL, verifica el checksum
de cada versión y crea el perfil local de forma idempotente. No hay downgrade
automático: restaurar backup y corregir una migración fallida antes de reintentar.

## Lecturas de telemetría y fixtures locales

No hay endpoint de ingestión hasta PR5. Con acceso administrativo a la base local,
el comando explícito `fixture` crea un dispositivo/fuente propios e ingiere un
array de 1..200 uplinks (máximo 1 MiB) por el mismo caso de uso transaccional.
Valida todo el input antes de crear el dispositivo; no modifica fuentes existentes
ni entrega credenciales de red. Si falla DB durante el replay, revisar el UUID
creado antes de repetir: las recepciones ya confirmadas quedan conservadas.

```sh
pnpm --filter @cubeos/api fixture < packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json
# Copiar deviceId UUID de la salida, no usar "CS01" en las rutas:
curl --fail http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/snapshot
curl --fail 'http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/packets?m=E&limit=100'
curl --fail 'http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/packets.csv?m=E&limit=100'
pnpm --filter @cubeos/api rebuild DEVICE_UUID
```

`fixture` devuelve resultados y proyección en JSON; `rebuild` exige propiedad del
perfil local y reproduce evidencia sin cambiar revisión. Usar el binario `server`
directamente en Docker (pnpm añade su propio texto a stdout). Consultas autorizadas
de UUID ajeno devuelven 404. Snapshot sin evidencia también devuelve 404.
REST no expone raw de fuentes inexistentes sin dispositivo atribuible.

Historial pagina por recepción, incluyendo rechazos/duplicados del dispositivo;
solo `logicalSample=true` cuenta como muestra. Primera página fija watermark,
posteriores mantienen límite superior aun con ingestión concurrente. Filtros
`m/from/to` (intervalo inclusivo de recepción UTC), `cursor`, `limit=1..200`
(default 100); cursor exige mismo dispositivo/filtros y tipos/rangos válidos.
CSV requiere `m`, escribe solo muestras lógicas de una página, sin valores de
otros grupos ni relleno; campos ausentes quedan vacíos. Continuar usando
`X-Next-Cursor` y conservar una única cabecera. Una página de solo rechazos puede
tener solo cabecera y cursor siguiente. Cancelación y error de escritura detienen
el flujo; timeout de consulta/export de 5 s y máximo de 200 recepciones por página.
No se carga todo historial en memoria ni se elimina automáticamente.

Rutas/errores/formas: [OpenAPI](../../packages/contracts/openapi/telemetry.yaml).
Campos, frescura, cuotas de payload y política conservadora de orden/reboot:
[telemetría](../../docs/telemetry.md).

## Docker y operación sin Internet

Copiar `infra/docker/.env.example` a `infra/docker/.env` y reemplazar la clave
por una contraseña local aleatoria URL-safe. Preparar imágenes/dependencias
con conexión. Compose publica web/API exclusivamente en loopback;
PostgreSQL no publica ningún puerto. El runtime funciona sin Internet, pero
la red bridge normal no impone un firewall de salida.

```sh
docker compose -f infra/docker/compose.yaml up --build -d
curl --fail http://127.0.0.1:8080/readyz
curl --fail http://127.0.0.1:3000/visor
# Arranque posterior sin reconstruir/descargar imágenes:
docker compose -f infra/docker/compose.yaml stop
docker compose -f infra/docker/compose.yaml up --no-build --pull never -d
```

El volumen `postgres-data` conserva dispositivos/perfil tras reinicios. No usar
`down -v` para reiniciar una instalación. El backend admite `LOCAL_CONTAINER=true`
para escuchar en `0.0.0.0` dentro del contenedor; esa excepción solo es válida
en una red aislada con publicación loopback como este Compose. No publicar
manualmente ese puerto en una interfaz pública.

Next empaqueta las fuentes descargadas durante el build en `.next/static`;
el runtime no necesita Google Fonts. Docker configura el estilo del mapa a una
ruta local sin tiles (`/offline-map-not-configured.json`): activa su fallback
existente sin solicitar OpenFreeMap. No bloquea el tablero. Para incluir tiles
locales, empaquetar sus assets y configurar el build arg `NEXT_PUBLIC_MAP_STYLE_URL`.
El desarrollo web nativo conserva su configuración de mapa actual.
Para verificar también el navegador del host sin recursos remotos, el proxy
descartable `infra/docker/offline-browser-proxy.go` impone CSP con recursos
solo del origen local, sin cambiar la configuración del navegador ni la web:

```sh
go run infra/docker/offline-browser-proxy.go http://127.0.0.1:3000
# Abrir http://127.0.0.1:3104/visor, comprobar demo, fuente y fallback del mapa.
# Revisar la consola por dependencias externas bloqueadas y cerrar el proxy.
```

La galería conserva sus seis fotos originales, ahora empaquetadas localmente
con [procedencia y créditos](../web/public/demo/camera/README.md), y los sensores
siguen simulados. `smoke.sh` arranca las imágenes preparadas en una red interna
sin egress usando `compose.offline.yaml`, comprueba persistencia, fuente y fotos
desde los contenedores y luego restaura la publicación loopback normal.
`/lab` es archivo
de exploración con una fotografía remota; no es parte del recorrido local.

## REST y seguridad

Un perfil de instalación local persistente, sin login, contraseña ni sesiones
individuales. Toda persona con acceso local al puerto comparte ese perfil.
`DEPLOYMENT_MODE=public` con auth local se rechaza. `AUTH_MODE=clerk` falla
cerrado hasta PR8: una falla del proveedor nunca habilita perfil local.

`GET /api/v1/devices` lista los dispositivos del principal. `POST` en la misma
ruta acepta `{"name":"Mi CubeSat","protocolDeviceId":"CS01"}`. `GET`, `PATCH`
y `DELETE /api/v1/devices/{uuid}` consultan, renombran y eliminan; PATCH solo
admite `{"name":"Nuevo nombre"}`. El ID de vuelo no cambia al renombrar y no
es globalmente único. El ID cumple el patrón hardware v2 (`[A-Z0-9_-]`, 2–12
caracteres), y el nombre visible permite hasta 120 caracteres Unicode.
Acceso a UUID ajeno devuelve 404 para los tres métodos.
Errores usan `{"error":{"code":"..."}}`, sin detalles SQL ni secretos.

Host se limita a localhost/loopback con el puerto configurado, incluso para
lecturas, para mitigar DNS rebinding. Origen explícito se compara exactamente
con `ALLOWED_ORIGIN` (por defecto `http://localhost:3000`); escrituras JSON
rechazan sitios ajenos, tipos de contenido de formularios, `Sec-Fetch-Site`
cross-site, cuerpos mayores a 8 KiB, claves desconocidas y JSON concatenado.
CLI sin Origin se permite porque no recibe automáticamente una identidad de
un navegador. CORS no sustituye estas validaciones. No hay TLS local.

## Verificación

Tests de configuración/validación se ejecutan siempre. Los tests PostgreSQL
se omiten explícitamente sin las variables siguientes; CI falla si falta una.
Usar tres bases
**descartables exclusivas**: los tests eliminan y recrean su schema `public`.
CI proporciona las tres y ejecuta formato, vet, tests y race detector.

```sh
export TEST_DATABASE_URL=postgres://test:password@127.0.0.1:5432/cubeos_http_test
export TEST_MIGRATION_DATABASE_URL=postgres://test:password@127.0.0.1:5432/cubeos_migrations_test
export TEST_INGESTION_DATABASE_URL=postgres://test:password@127.0.0.1:5432/cubeos_ingestion_test
pnpm --filter @cubeos/api test
pnpm --filter @cubeos/api lint
```
