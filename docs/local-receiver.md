# Lector local de telemetría

Esta entrega ejecuta API Go, PostgreSQL y Visor preparado, sin login. No publica
datos en Convex ni acredita Vercel desplegado. El firmware .ino ESP32-C3 SuperMini
corresponde a la entrega posterior. Un puerto virtual no certifica tu placa/cable.

## Requisitos y primera preparación

Linux, Node 22.23.2, pnpm 11.22.0, Docker Engine activo y Docker Compose v2.
Go y Arduino CLI no son requisitos de uso. Internet se necesita inicialmente;
descarga imágenes, dependencias y fuentes antes de desconectar. El mapa offline
conserva su fallback, no trae tiles cartográficos.

Desde el checkout que contiene este PR:

    pnpm install --frozen-lockfile
    pnpm local:setup
    pnpm local:doctor
    pnpm local:start

Setup obtiene las imágenes GHCR de la revisión Git actual, comprueba su etiqueta
y conserva los IDs de contenido. Genera configuración privada y migra la DB.
Repetirlo no reemplaza contraseñas ni borra datos. Los PRs no integrados pueden
no tener imágenes publicadas o accesibles. En ese caso prepara desde fuente:

    pnpm local:setup -- --build

Esta variante requiere Docker Buildx y compila dentro de Docker una vez; no
instala Go en el host ni instala herramientas globales automáticamente.
Start no compila ni descarga imágenes. Las imágenes preparadas se conservan
al repetir setup. Para reconstruir tras actualizar código: detener, hacer backup,
actualizar el checkout y ejecutar setup --build. No se hacen downgrades ocultos.

## Abrir y conectar

Web: <http://localhost:3000>. API: <http://localhost:8080>.
En Configuración: API local → URL de API → Consultar dispositivos → seleccionar
**ESP32-C3 · datos sintéticos · CS01**. Start aprovisiona una sola fuente serial
y dispositivo, sin insertar muestras ni seleccionar otro equipo automáticamente.

Identifica la ruta exacta. No copies literalmente el marcador PUERTO:

    ls -l /dev/serial/by-id/
    pnpm local:start -- --serial /dev/serial/by-id/PUERTO --baud 115200
    pnpm local:status

También admite una ruta explícita /dev/ttyACM0 o /dev/ttyUSB0. El puerto queda
recordado. Firmware debe emitir un envelope v1 JSON por línea LF con payload v2
válido e id CS01. Cierra Serial Monitor antes de usar el lector. No se flashea
la placa desde estos comandos.

El contenedor usa UID 10001, el GID del puerto y solo ese dispositivo/bind,
sin privileged ni todo /dev. Si ese grupo no puede leer/escribir, revisa permisos
con el administrador; no uses chmod 777 ni reglas udev generales.
Doctor no abre el puerto ni certifica exclusividad. API lista no significa
datos USB recibidos: status muestra la edad de la última recepción, si existe.

Al desconectar USB, valores retenidos envejecen, no se sustituyen por ceros/DEMO.
Al reconectar puede cambiar el nodo: repite local:start con la ruta actual
para recrear el mapeo de API. Go recupera errores del mismo nodo con backoff;
no se promete remapeo Docker automático.

## Parada y diagnóstico

    pnpm local:doctor
    pnpm local:status
    pnpm local:stop

Son servicios Compose en segundo plano, no un daemon nuevo del sistema.
Stop solo detiene esta instalación y conserva volúmenes, dispositivos, historial
y fotos. No usar down -v/prune sobre datos útiles. Status/doctor/stop sin setup
no crean instalaciones.

Los fallos de procesos se guardan en el registro privado
.cubeos/runtime/last-error-docker.log (o el comando correspondiente).
No pegues registros completos en issues: pueden contener detalles privados.
El bootstrap no imprime contraseñas, tokens ni envfiles. Si Docker agotó su pool
de redes, revisa tus redes con su propietario; no hay limpieza global automática.

Si un proceso interrumpido dejó un lock, doctor verifica su PID. Para recuperar
solo un lock privado de esta raíz cuyo proceso ya no existe:

    pnpm local:setup -- --recover-lock

Se rechazan procesos vivos, identidades ajenas y locks inválidos. PID reutilizado
o recovery.lock interrumpido requieren inspección manual; no se adivina ni se
borra un lock activo para iniciar dos preparaciones simultáneas.

## Datos y desarrollo

Configuración: .cubeos/runtime/config.json (0600, directorio 0700). Cada raíz
usa cubeos-runtime-HASH con volúmenes propios postgres-data/media-data/media-staging.
Mover el checkout cambia la identidad: haz [backup/restauración](backups.md)
antes. No copiar config a otra raíz ni adoptar datos por nombre del CubeSat.
Si una DB restaurada perdió el binding, start falla cerrado en vez de crear
silenciosamente otro dispositivo. No regenerar UUIDs para eludirlo.

Docker usa el contexto default local, no un contexto remoto exportado. Contextos
rootless personalizados requieren soporte adicional. Env cloud/S3/serial/Compose
exportados no alteran este runtime. Wi-Fi aún no se habilita; DB y gestión no se
publican en LAN. Puertos privados configurables (1024..65535, distintos) antes
de iniciar; mantener localhost como hostname de web/API.

Para contribuir sigue disponible [pnpm dev](local-development.md), con Go/Next
nativos y datos propios. Sus fotos .cubeos/media y volúmenes son independientes.
No ejecutar desarrollo y runtime simultáneamente sobre 3000/8080.

## Verificación descartable

tools/runtime/smoke.mjs exige opt-in y genera una raíz nueva en /tmp; no acepta
una DB de alumnos. Usa imágenes preparadas y un helper PTY compilado solo para
tests. Comprueba repetición, puertos ocupados, serial de software, PostgreSQL,
SSE/navegador, silencio, reconexión, foto idéntica y red interna sin Internet.
Retira solo sus contenedores/red (sin -v), conservando volúmenes recuperables.
CI exige local-reader además de los gates existentes. PTY y compilación no
sustituyen el ensayo físico con ESP32-C3 SuperMini.
