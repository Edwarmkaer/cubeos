# API local (PR3)

Go 1.27.1 (misma versión en `.go-version`, `go.mod`, Docker y CI), PostgreSQL
17.6. Esta entrega persiste identidad y dispositivos. La web conserva su demo;
todavía no consume esta API. Ingestión, SSE, Clerk, progreso y medios pertenecen
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

## Docker y operación sin egress

Copiar `infra/docker/.env.example` a `infra/docker/.env` y reemplazar la clave
por una contraseña local aleatoria URL-safe. Preparar imágenes/dependencias
con conexión. Compose tiene una red interna sin salida a Internet y publica
web/API exclusivamente en loopback; PostgreSQL no publica ningún puerto.

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
el runtime no necesita Google Fonts. El mapa externo ya tiene estado de error
explícito y no bloquea el tablero sin tiles; no se incluyen tiles offline.
La galería demo está vacía y los sensores siguen simulados. `/lab` es archivo
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
se omiten explícitamente sin las variables siguientes. Usar dos bases
**descartables exclusivas**: los tests eliminan y recrean su schema `public`.
CI proporciona ambas y ejecuta formato, vet, tests y race detector.

```sh
export TEST_DATABASE_URL=postgres://test:password@127.0.0.1:5432/cubeos_http_test
export TEST_MIGRATION_DATABASE_URL=postgres://test:password@127.0.0.1:5432/cubeos_migrations_test
pnpm --filter @cubeos/api test
pnpm --filter @cubeos/api lint
```
