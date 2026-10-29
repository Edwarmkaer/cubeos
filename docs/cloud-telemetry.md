# Telemetría cloud temporal

Go y PostgreSQL locales siguen recibiendo, normalizando y guardando las tramas v2.
Convex conserva únicamente la última proyección de cada canal: no sincroniza el
historial ni las fotografías. La web consulta mediante una suscripción reactiva.
El relay es opcional; sin Internet, la recepción y el visor locales siguen funcionando.

## Preparación

Primero sigue [el runtime local](local-development.md). El receptor debe tener un
dispositivo registrado (`pnpm local:status`). El administrador de Convex necesita
una sesión válida de su CLI y las funciones de `packages/cloud` desplegadas.

```bash
pnpm cloud:channel:create -- --directory .cubeos/runtime/practica-01 --device UUID_DEL_DISPOSITIVO --endpoint https://DEPLOYMENT.convex.site/telemetry/v1/snapshot --url https://DEPLOYMENT.convex.cloud
pnpm cloud:enable -- --config .cubeos/runtime/practica-01/publish.json
```

La carpeta de salida debe ser nueva y su padre debe existir. Las dos credenciales
independientes se guardan en archivos privados 0600. `publish.json` solo corresponde
al lector local; `read.json` contiene URL, canal y clave de consulta para introducir
en Configuración → Cloud. No compartir publicación, subir estos archivos a Git,
añadirlos a URLs, firmware, variables `NEXT_PUBLIC` o capturas de pantalla.
La clave del navegador solo vive en memoria: al recargar hay que introducirla otra vez.

Los canales duran ocho horas y requieren creación administrativa explícita.
Para revocar un canal antes:

```bash
pnpm --filter @cubeos/cloud exec convex run --deployment DEPLOYMENT channels:revoke '{"channelId":"UUID_DEL_CANAL"}'
pnpm cloud:disable
```

La revocación elimina la lectura del navegador abierto; detener el relay no revoca
una consulta ya concedida. `cloud:disable` retira únicamente el archivo de publicación
del volumen privado y no borra fotos, historial ni el dispositivo. No necesita USB
conectado. `pnpm local:stop` detiene los servicios conservando los volúmenes.

## Límites y fallos

Máximo una publicación por segundo con revisión nueva: hasta 3600/hora de actividad.
Sin backlog; después de un corte publica la última lectura confirmada, no cada trama
intermedia. Timeout de cinco segundos, reintentos hasta cada treinta segundos.
Una credencial vencida/revocada o una revisión remota superior suspenden el relay;
crear un canal nuevo y habilitarlo explícitamente. Nunca se reinicia automáticamente
un historial restaurado para sobrescribir datos cloud más recientes.

Las revisiones int64 viajan como cadenas decimales exactas. Los tiempos de recepción
originales se conservan; una suscripción conectada no demuestra enlace radio ni
frescura del hardware. La web no reemplaza silencios por DEMO.

## Verificación

Los tests unitarios no necesitan credenciales cloud. La prueba real es opt-in y usa
una instalación temporal independiente; no puede apuntar a la base del estudiante:

```bash
CUBEOS_RUNTIME_SMOKE=1 CUBEOS_CLOUD_SMOKE=1 \
CUBEOS_SERIAL_HELPER=/ruta/serial-smoke \
CUBEOS_CLOUD_SITE_URL=https://DEPLOYMENT.convex.site \
CUBEOS_CLOUD_URL=https://DEPLOYMENT.convex.cloud \
node tools/runtime/smoke.mjs
```

El helper se compila desde `apps/api/cmd/serial-smoke`. La prueba requiere imágenes
preparadas mediante `pnpm local:setup -- --build`, Docker y Playwright. Crea y revoca
su propio canal; conserva los volúmenes temporales para diagnóstico, sin borrar
instalaciones del usuario. No acredita una prueba física de ESP32.
