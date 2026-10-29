# Recepción funcional: ESP32-C3, estación local, Convex y Vercel

Fecha: 2026-10-29. Estado: arquitectura aprobada por Edwar en este chat.
La aprobación autoriza preparar el plan de implementación; no acredita entregas.
Sustituye el alcance de progreso/login del borrador anterior, que no llegó a implementarse.
No acredita implementación, despliegue ni prueba física. Railway queda fuera.

## Resultado que debe poder probar el usuario

1. Preparar e iniciar el lector local con comandos de pnpm.
2. Cargar un `.ino` en su ESP32-C3 SuperMini; la placa emite datos sintéticos en loop.
3. Conectar USB y observar esos datos, no la DEMO del navegador, en el Visor local.
4. Con Internet y envío cloud habilitado explícitamente, observar la réplica de
   las últimas lecturas en el Visor de Vercel, sin registro de estudiante.
5. Desconectar Internet/USB y distinguir antigüedad, error y recuperación.

No desarrollar ahora cuentas Clerk, alias, progreso, guía, análisis cloud ni UI
nueva. Conservar esas funcionalidades locales existentes, sin borrarlas. Tampoco
subir fotos ni historial completo. No cambiar campos/unidades del payload v2.

## Arquitectura elegida

El lector es la API Go existente con el adaptador serial, no otro framework.
Recibe envelope v1 NDJSON con payload v2; valida y persiste en PostgreSQL.
La normalización/orden/reboot/frescura conservan un único dueño en Go.

El Visor local consume REST/SSE actuales. Una réplica opt-in, dentro del mismo
backend Go, lee la proyección ya confirmada y envía el último snapshot por HTTPS
a una HTTP action de Convex. El Visor Vercel consulta Convex directamente desde
el navegador mediante suscripciones. Vercel no toca USB, no ejecuta el lector ni
usa localhost del servidor para alcanzar al ordenador del estudiante.

Se conserva Go/PostgreSQL para no reescribir recepción, contratos y pruebas.
Descartado: migrar toda la ingestión a Convex para este ensayo. Descartado:
Vercel→localhost, por permisos de navegador y exposición innecesaria. Se acepta
el coste de una réplica limitada, no una sincronización de bases de datos.

### Borde cloud mínimo

- `packages/cloud`: esquema, HTTP action de recepción de snapshots y consulta
  de última lectura por canal de prueba. Convex aporta transporte reactivo,
  no reimplementa el ensamblaje de tramas.
- `apps/api/internal/cloudrelay`: envío opcional aislado del commit local;
  errores de Internet/Convex no bloquean serial, PostgreSQL ni SSE local.
- `apps/web`: fuente cloud adicional explícita y adaptador al estado v2 existente.
  Modo local/cloud/DEMO nunca se elige como fallback silencioso.
- `tools/esp32-telemetry`: sketch Arduino y pruebas de los envelopes emitidos.
- `tools/dev` y `infra/docker`: comandos de preparación/diagnóstico/ejecución.

La revisión int64 viaja como cadena decimal; no redondear con Number. Validar
snapshot, versión de réplica y frescura sin cambiar el snapshot Chasqui. Conservar
tiempos originales de recepción; la llegada cloud no rejuvenece los sensores.
No inferir actitud/SOC/índice UV ni conexión de radio de una recepción sintética.

### Alcance de la réplica y fallos

Un solo dispositivo y canal de prueba por ensayo. Publicar como máximo una vez
por segundo, solo ante nueva revisión. Conservar localmente todas las tramas;
cloud puede omitir revisiones intermedias y no se anuncia como historial completo.
La cola del relay es de tamaño uno: sustituir lo pendiente por lo más reciente.
Retry con backoff acotado, timeout y sin redirect que pueda filtrar credenciales.
En 401/403 dejar de reintentar automáticamente y pedir reaprovisionamiento.

El canal tiene identidad nueva por instalación/ensayo; nombres de vuelo no
autorizan vinculaciones. Revisiones antiguas/duplicadas no reemplazan revisiones
nuevas. Un restore/reinstalación no reutiliza el canal previo automáticamente.
Si no hay avance mostrar edad de datos retenidos, no un ficticio estado conectado.
No recuperar un backlog completo al reconectar. Un reinicio recupera el último
snapshot local y puede reenviarlo idempotentemente.

## Acceso sin login, pero no sin protección

Para el ensayo se aprovisiona administrativamente un canal temporal con dos
credenciales aleatorias independientes: publicar y consultar. Solo hashes en DB
cloud; tokens nunca en URL, Git, logs ni firmware. El lector usa únicamente la
credencial de publicación desde archivo privado 0600. El navegador recibe la
de consulta por un campo de acceso de la práctica, solo en memoria. No es alias,
cuenta personal ni sesión/progreso de construcción. Lectura no concede escritura.

Caducidad propuesta: ocho horas y revocación administrativa. Endpoints validan
tamaño/esquema, autorización, TTL y rate limit por canal; entradas inválidas no
modifican proyección. No endpoint público que emita canales sin control. No
token de administrador/deploy en el lector distribuido. La configuración privada
para operar este primer ensayo se entrega fuera del repositorio; no se promete
onboarding público multiestudiante todavía. Probar A/B y revocación antes de publicar.

Sin credencial cloud la estación local sigue funcionando y el Visor público pide
acceso; no cae a datos ajenos ni a DEMO. No instalar Clerk para este alcance.

## Servicio lector y experiencia local

Linux es el objetivo inicial, coherente con el equipo de Edwar. Node/pnpm y
Docker son requisitos de uso; Go solo para desarrollo. El runtime usa imágenes
preparadas del backend y PostgreSQL; web local preparada incluida para offline.
No compilar Go/Next en cada arranque. Primera descarga/preparación necesita red.

Interfaz de comandos propuesta, todavía no implementada:

```sh
pnpm local:setup
pnpm local:doctor
pnpm local:start -- --serial /dev/serial/by-id/PUERTO --baud 115200
pnpm local:status
pnpm local:stop
```

Setup configura secretos una vez y aplica migraciones; start aprovisiona una
fuente serial de prueba de manera repetible, sin duplicados ni telemetría semilla
automática. Selección de puerto explícita, sin abrir/flashear dispositivos al azar.
No ignorar configuración serial como hace hoy `tools/dev/local.mjs`.

Compose mantiene la API de gestión y DB en loopback/red privada, pasa solo el
dispositivo y su GID al contenedor sin root, sin privileged. Doctor detecta
permisos, puerto ocupado, cable/puerto ausente, herramientas y readiness. No
ejecutar chmod 777 ni cambiar grupos del usuario sin consentimiento. Monitor
serie Arduino debe estar cerrado mientras el lector posee el puerto.

Parar conserva volúmenes y fotos. Datos existentes de desarrollo y runtime no se
mezclan ni migran implícitamente; documentar backup y elección de instalación.
`pnpm dev` sigue disponible. No instalar daemon de sistema/autostart en el primer
PR; Docker puede mantener procesos en segundo plano con logs y parada explícitos.

## Firmware ESP32-C3 SuperMini, entrega posterior al servicio

Arduino-ESP32, destino ESP32C3 Dev Module y USB CDC On Boot habilitado cuando la
placa use USB nativo. Verificar variante física y puerto antes de grabar. Pinout
y LED no son necesarios. Solo alimentación/USB; no sensores ni Wi-Fi en el sketch
inicial. Baud nominal 115200, un envelope JSON por línea LF; sin logs sobre el
canal de telemetría. No esperar indefinidamente a que abra Serial para generar.

Loop con millis, secuencia creciente y H/E/O/I con valores sintéticos válidos
según fixtures v2; GPS opcional y señalado como simulado fuera del payload.
La placa puede reiniciar secuencia/uptime al reset: comprobar las reglas Go
existentes, no simular continuidad falsa. Probar normal, silencio/reinicio y
reconexión. Entregar `.ino`, versión de core/FQBN y comandos Arduino IDE/CLI
verificados al implementarlo. Compilar no acredita prueba física ni autoriza
flashear automáticamente el dispositivo de Edwar.

## PRs y evidencia de terminado

1. **Recepción local práctica**: comandos/runtime, aprovisionamiento serial y
   diagnóstico; prueba PTY → API → PostgreSQL → SSE → navegador y persistencia.
2. **Convex + relay + Visor público**: borde cloud mínimo, permisos temporales,
   validación e idempotencia, modo explícito y pruebas de pérdida de red. Sin
   rediseño visual; usar el Visor actual.
3. **Vercel y aceptación cloud**: proyectos/equipo exactos, configuración y gates
   CI; despliegue a URL verificada y smoke con simulador pasando por el lector,
   relay, Convex y navegador. No afirmar readiness solo por build o healthcheck.
4. **Sketch ESP32-C3 y ensayo**: compilar/testear envelopes y entregar `.ino` y
   pasos de carga; Edwar realiza conexión/carga y se registra evidencia física.
   Cerrar ensayo solo al ver avanzar datos de esa placa en local y Vercel.
5. **UI**: retomar propuestas guardadas después del recorrido funcional.

Antes de ejecutar se revisa esta spec y se escribe un plan implementable por PR.
Trabajar desde main en checkout aislado; no incluir los cambios Pencil locales.
Conservar los gates existentes, ramas sin codex/ y commits del usuario sin
atribución IA. No merges sin petición explícita.

## Estado comprobado al redactar

- No hay código Convex/relay/firmware ni comandos local:* implementados en el repo.
- Vercel MCP accede al equipo `edwarmkaers-projects`; no devuelve proyecto por
  nombre CubeOS/cube ni vinculado a `Edwarmkaer/cubeos` en las consultas realizadas.
- Hay configuración de autenticación Convex CLI; no acredita proyecto,
  despliegue, funciones, plan Free ni recepción listos. No se imprimieron secretos.
- Docker y pnpm están presentes; Go existe fuera de PATH en la ubicación usada
  por este proyecto. Arduino CLI no está en PATH. No se comprobó Docker activo.
- No se detectó `/dev/serial/by-id` en la revisión anterior; no se certifica placa
  conectada ni permisos de USB. Ningún servicio fue instalado o iniciado aquí.

No habilitar consumo medido. Comprobar cuotas Free reales antes de aprovisionar;
1 envío/s son 3600 peticiones/hora antes de consultas y actualizaciones. Detener
relay al terminar el ensayo; el firmware puede seguir en loop sin subir a nube.

Referencias: [transportes](../../hardware-transports.md),
[telemetría](../../telemetry.md), [operación local](../../local-development.md),
[contratos](../../../packages/contracts/README.md),
[USB CDC oficial Espressif](https://docs.espressif.com/projects/arduino-esp32/en/latest/tutorials/cdc_dfu_flash.html),
[Convex HTTP actions](https://docs.convex.dev/functions/http-actions).
