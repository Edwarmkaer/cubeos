# Realtime de telemetría

PR6 implementa `GET /api/v1/devices/{UUID}/events` en la API de gestión. La
escucha LAN de ingestión sigue exponiendo únicamente POST packets. Este enlace
es navegador→API; su conexión no prueba conexión ESP32→CubeSat ni estado de radio.
El visor consume v2 desde PR7 y conserva demo explícita. PR8 incorpora
[identidad pública](public-auth.md) sin fallback local.

El evento `snapshot` entrega `{revision,snapshot,freshnessByGroup}` completo,
sin raw rechazado ni procedencia interna `projectionState`. Contrato de campos:
[OpenAPI](../packages/contracts/openapi/telemetry.yaml). El identificador SSE es
`UUID:revisionDecimal`, ligado al dispositivo y exacto para int64. `Last-Event-ID`
no promete replay completo: al conectar se obtiene la proyección actual. El
[historial REST](telemetry.md) conserva las recepciones y su paginación estable.
Sin evidencia aún, el stream abre con comentario y espera la primera proyección.

PostgreSQL encola `pg_notify` dentro de la misma transacción que cambia la
proyección; solo COMMIT publica el UUID. Duplicados, rechazos, rollback y muestras
aceptadas que no cambian la proyección no avisan. Un listener dedicado por proceso
redistribuye invalidaciones, con una posición de cola por suscriptor; los avisos
se pueden coalescer y la proyección se vuelve a leer desde PostgreSQL. Suscribir
antes de la lectura inicial cubre commits concurrentes. Cada listener reconecta
con espera de un segundo y despierta suscriptores; heartbeat también reconcilia
el estado, por lo que una pérdida de NOTIFY no requiere historial de eventos.

La autorización se comprueba antes de abrir y en cada aviso/heartbeat. UUID de
otro dueño responde 404. La identidad local no usa bearer y rechaza credenciales
de fuente como identidad de usuario. El puerto de resolver admite `ExpiresAt`:
una sesión verificada expirada o revocada cierra el stream, sin extender su
duración. En público el límite es el mínimo entre `exp` verificado y 5 minutos
desde apertura. Clerk/inscripción/propiedad se revalidan en cada aviso y heartbeat;
revocación idle se observa en hasta 15 s más el presupuesto de operación 5 s.
La expiración inicial tiene timer propio y nunca se extiende por revalidar.
Los query parameters se rechazan, incluido cualquier token en URL.

Heartbeat es un comentario cada 15 s. Cada operación DB/identidad y escritura
tiene límite de 5 s; el stream no hereda el timeout REST de 5 s. Una escritura
atascada cierra esa conexión sin bloquear la ingestión ni otros dispositivos.
Cancelar la solicitud, cerrar el hub o apagar el servidor libera suscriptores.
La antigüedad se deriva de `receivedAt` de grupo/campo: puede aumentar sin nueva
revisión. Los heartbeats no inventan mediciones ni cambian frescura/revisión.

`@cubeos/api-client` exporta `APIClient(baseURL)` y
`subscribeTelemetry(deviceId,{getToken,onSnapshot,onConnection,signal})` como
método. Cada conexión vuelve a pedir token, consulta snapshot REST y abre fetch
SSE con Bearer en header; en local `getToken` devuelve null. Deduplica ambos por
revisión exacta. El wire mantiene los números originales: `revisionId` es un
string decimal adicional del cliente, apto para `BigInt`, porque `revision` como
number pierde precisión sobre 2^53. No usar ese number para ordenar o deduplicar.
El hub normaliza solo su clave de dispositivo: URLs con UUID en mayúsculas
reciben avisos del UUID canónico de PostgreSQL. El evento conserva el UUID
solicitado en su ID, que el cliente compara exactamente; bearer/identidad no se
transforman.
Los esquemas y fixtures originales de hardware se conservan intactos.

EOF, cortes de red y HTTP 408/429/5xx reconectan con backoff 250 ms→10 s. HTTP
401/403 y errores de Content-Type/JSON/contrato paran y se propagan, sin bucle
de reintento. El consumidor decide cómo renovar sesión y empezar otra suscripción.
Un stream silencioso se corta a 45 s. Parser incremental maneja UTF-8 partido,
CR/LF/CRLF, `data` multiline y comentarios. Evento/buffer y respuestas REST se
limitan a 1 MiB. Cancelación interrumpe lectura, token pendiente y backoff.
Cambiar dispositivo/sesión requiere abortar la suscripción anterior con su
AbortController; el cliente no mantiene un store global compartido.

Pruebas: Go race con PostgreSQL real para fuente HTTP→DB→SSE, A/B, rollback,
no-op, duplicados, owner transfer y reconnect; TCP lento y sesiones en fixtures.
TypeScript prueba chunks, memoria, precisión int64, cancelación y contrato.
El smoke del CLI real añade consumo por este cliente; Docker prueba persistencia,
restart y ejecución preparada sin egress. USB/radio físicos quedan fuera de
estas pruebas; reader/PTY es el alcance de serial en runner.
