# Recepción serial y HTTP (PR5)

Ambos adaptadores llaman a `Ingest`; validación, unidades, orden y evidencia
pertenecen a [telemetría](telemetry.md). La web continúa en demo. No hay gateway
separado, LoRa, telecomando, firmware ni fotografías en este borde.

## Fuentes y credenciales

Con dispositivo registrado y API local en loopback:

```sh
curl --fail -H 'Content-Type: application/json' -d '{"transport":"http","gatewayId":"receptor-terreno"}' http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/sources
curl --fail http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/sources
curl --fail -X DELETE http://127.0.0.1:8080/api/v1/devices/DEVICE_UUID/sources/SOURCE_UUID
```

POST entrega credencial aleatoria de 256 bits una sola vez. Guardarla en el
receptor o gestor privado, nunca en URLs/repositorio/logs. Solo SHA-256 se
persiste; GET no entrega hash/secreto. DELETE revoca idempotentemente. Todas
las rutas comprueban propiedad. Hasta 32 fuentes activas por dispositivo;
listado acotado a 128, priorizando activas e incluyendo revocadas. Rotar creando otra fuente y luego
revocar la anterior. `gatewayId` registrado manda sobre el envelope. El UUID
de fuente decide dispositivo autorizado; `CS01` puede repetirse entre dueños.
`payload.id` ajeno se rechaza y audita. Fuente serial requiere propiedad local
y su credencial no sirve para HTTP.

## USB/UART

Propuesta pendiente con firmware: **un envelope v1 por línea LF**, con CRLF
admitido. No arrays ni binarios de cámara. Payload intacto y `receiver` opcional
siguen el [esquema](../packages/contracts/schemas/received-envelope-v1.json).
USB CDC o puente compatible puede exponer `/dev/tty…`; UART de nivel lógico
necesita puente y niveles eléctricos compatibles. Confirmar 8N1 y baudrate
con firmware, no se presume velocidad ni hardware.

Provisionar `transport:"serial"`, detener la API y configurar:

```sh
export SERIAL_PORT=/dev/serial/by-id/PUERTO_CONFIRMADO
export SERIAL_BAUD=BAUD_CONFIRMADO SERIAL_SOURCE_ID=SOURCE_UUID
pnpm --filter @cubeos/api dev
```

Driver fijado: [go.bug.st/serial v1.6.4](https://pkg.go.dev/go.bug.st/serial@v1.6.4).
Read timeout 250 ms; errores/open/EOF reintentan a 1 s con buffers nuevos.
Cancelación cierra puerto. Línea cortada sin LF queda `incomplete_frame` y no
se une a reconexión. No hay cola durable durante caída DB: receptor debe
conservar/retransmitir si necesita garantía de entrega. No se promete recuperar
bytes perdidos por driver/receptor al desconectar.

Docker Linux opcional, sobre instalación propia aprovisionada:

```sh
export SERIAL_HOST_DEVICE=/dev/ttyUSB_DISPOSITIVO_CONFIRMADO
export SERIAL_DEVICE_GID=GID_NUMERICO_DEL_DISPOSITIVO
export SERIAL_BAUD=BAUD_CONFIRMADO SERIAL_SOURCE_ID=SOURCE_UUID
docker compose -f infra/docker/compose.yaml -f infra/docker/compose.serial.yaml up -d
```

Pasa solo ese dispositivo a `/dev/cubeos-serial` y su grupo al proceso sin root.
Sin `privileged`, host network ni mounts amplios. Verificar permisos y
re-enumeración en equipo real; PTY no certifica USB físico. Puertos locales
conservan loopback.

## HTTP / Wi-Fi

`POST /api/v1/ingestion/packets`: `Authorization: Bearer CREDENCIAL`, JSON
envelope v1. Fuente y hora resueltas por servidor; autoridad externa,
claves duplicadas y metadatos nulos rechazados. RSSI/SNR no se insertan en
payload compacto. 200 aceptación/duplicado; 422 rechazo auditado; 401 credencial
inválida/revocada/otro transporte; 413 límite previo; 503 DB indisponible.
No CORS: Origin/Fetch-Site de navegador rechazados.

Gestión sigue en loopback. Para ESP32 en LAN privada y confiable, ejecución
nativa ofrece segunda escucha opt-in:

```sh
export INGESTION_ADDRESS=IP_PRIVADA_DE_ESTE_EQUIPO:8081
pnpm --filter @cubeos/api dev
```

IP explícita privada/loopback, nunca wildcard; puerto distinto a gestión.
Host debe coincidir exactamente. Solo ingestión, sin dispositivos/perfil/health.
HTTP LAN no cifra credencial: no usar red compartida/no confiable ni Internet.
Docker base no publica este puerto. Público falla cerrado hasta PR8; esta
opción no sustituye identidad pública/TLS.

## Límites y aceptación

Envelope máximo 16384 bytes (serial cuenta CR previo a LF); payload máximo
8192 conforme al caso de uso. Serial descarta exceso calculando tamaño/hash
completo, guarda prefijo máximo 8192 con `envelope_too_large` y recupera al LF.
Malformed/incomplete conservan raw frame; envelope válido conserva raw payload.
HTTP limita antes de ingestión: 413/cuerpo cortado no prometen recepción
persistida. Timeout HTTP lectura 10 s, cabecera 5 s, procesamiento 5 s. Buffers
acotados por frame, sin cola ilimitada ni purga implícita. Capacidad de disco
y retención requieren operación de instalación, no quedan garantizadas.

Pruebas: reader fragmentado/multi-frame/CRLF/malformed/límite/hash/EOF/reconnect/
cancelación/backoff; PTY Linux con driver real; PostgreSQL HTTP A/B y CS01
compartido, metadatos externos, revocación/paridad; CLI real→TCP→Go→DB en CI.
Docker verifica reinicio/offline. Suites Go borran `public`: solo bases propias
desechables. Pendiente de campo: framing/8N1/baudrate, puente/USB/ESP32 reales,
desconexión eléctrica y autenticación pública futura.
