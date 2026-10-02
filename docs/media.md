# Fotografías privadas e importación

PR10 implementa el borde independiente de fotos de [ADR 0005](adr/0005-backend-local-cloud-media.md).
Una instalación conserva metadata en su PostgreSQL y objetos en un proveedor
configurado. Telemetría v2 y `cameraOk` no demuestran recepción de una foto.
El modelo de relación vive en [domain-model](domain-model.md), las rutas en
[OpenAPI](../packages/contracts/openapi/telemetry.yaml).

## Entrada y límites

La API acepta un multipart con un archivo `file`, MIME `image/jpeg` o
`image/png`, y opcionalmente `capturedAt` RFC3339 antes del archivo. Desconocido
se omite y persiste como null; `importedAt` procede de PostgreSQL. No interpreta
EXIF ni fechas del nombre. Fechas anteriores a 1970 o más de cinco minutos en
el futuro se rechazan. El nombre recibido se descarta; UUIDs generados en el
servidor determinan las claves y el nombre de descarga.

`MEDIA_MAX_BYTES` tiene default 67108864 (64 MiB), máximo 268435456;
`MEDIA_MAX_PIXELS` tiene default y máximo 80000000 (80 MP). Ambos admiten un
límite menor positivo. Firma/MIME y dimensiones se comprueban antes de decodificar.
Un upload/decoder por proceso, disco de staging, copia en bloques y deadline
de 120 segundos acotan recursos; un upload concurrente recibe 413. El multipart
admite como máximo 64 KiB adicionales; rechaza partes extra y transfer-encoding.
JPEGs/PNGs cuyo header es válido pero cuyo derivado no se puede decodificar
conservan el original y dejan pendiente la miniatura para inspección/reintento.

El original se conserva byte a byte con SHA-256 y comprobación de lectura después
de la escritura. Una miniatura JPEG separada tiene lado máximo de 320 px. Fallar
la miniatura no descarta el original. No hay conversión del original ni subida
S3 directa/reanudable. Una carga manual puede provenir de archivos previamente
copiados desde una Raspberry Pi por USB: CubeOS no monta automáticamente la Pi.
UART binario espera framing, fragmentación, checksum y tamaño acordados con hardware.

## Autorización y operación HTTP

El propietario puede importar/listar y descargar originales/miniaturas por Go:

```text
POST /api/v1/devices/{uuid}/photos
GET  /api/v1/devices/{uuid}/photos?limit=24&cursor=...
GET  /api/v1/photos/{uuid}/original
GET  /api/v1/photos/{uuid}/thumbnail
POST /api/v1/devices/{uuid}/media-credentials  body: {}
DELETE /api/v1/devices/{uuid}/media-credentials/{credential_uuid}
```

La página tiene `items` y `nextCursor`, orden importación/UUID descendente; límite
1–100. El cursor está ligado al dispositivo y no concede autorización. `pending`
no se puede descargar; `hasThumbnail=false` no impide descargar un original listo.
La galería muestra únicamente miniaturas listas, 24 por petición; pulsar una imagen
descarga el original. Configuración importa el archivo seleccionado. NASA permanece
exclusivamente en DEMO. No hay captions, instrucciones ni scrollbar visible en la tira.

La credencial de medios, prefijo `media_`, se devuelve solo al crearla; se guarda
su hash. Está ligada a dispositivo **y propietario de emisión**, revocable, máximo
32 activas por dispositivo. Solo autoriza POST de fotos: no autoriza lectura,
lista, dispositivos ni gestión. Cambiar propietario invalida la autorización.
Credenciales de fuente/telemetría no autorizan fotos, ni las de medios autorizan
telemetría. La sesión Clerk del propietario no se reemplaza por una credencial hardware.

Para Wi-Fi, el servidor ofrece el POST de fotos además de paquetes en la escucha
privada opt-in `INGESTION_ADDRESS` documentada en [transportes](hardware-transports.md).
Esa escucha solo acepta la credencial de medios para fotos y rechaza Origin/browser,
lecturas y gestión. En pública, la API HTTPS sirve el mismo POST. Ejemplo conceptual
de Pi/ESP32, con el secreto conservado fuera del repositorio y sin imprimirlo:

```bash
curl --fail --config "$PRIVATE_CURL_CONFIG" \
  -F 'file=@camera-copied.jpg;type=image/jpeg' \
  "$API_URL/api/v1/devices/$DEVICE_UUID/photos"
```

El config privado de curl aporta `Authorization: Bearer ...`; usar credencial de
medios para hardware, sesión para propietario público, sin bearer para perfil local.
Un retry vuelve a importar como otra foto/UUID. Ante un resultado incierto, consultar
la lista y SHA antes de repetir; no hay clave de idempotencia cliente en esta entrega.

Las respuestas llevan `Cache-Control: no-store` y `nosniff`. S3 se sirve a través
del backend autorizado; no genera ni guarda URLs firmadas. Tokens, listas, blobs y
selección viven en memoria; cambio de dispositivo/cuenta/logout aborta peticiones,
revoca blob URLs y descarta resultados tardíos. No se registran secretos, imágenes
ni URLs privadas. CDN pública no se habilita: requiere un futuro opt-in explícito
de visibilidad pública, nunca caching público de estas fotos.

## Proveedores y persistencia

`MEDIA_STORAGE=local` usa `MEDIA_LOCAL_ROOT` (default `./data/media`) persistente
y privado, sin red/Clerk. `MEDIA_TEMP_ROOT` (default `./data/media-staging`) es un
directorio exclusivo de CubeOS; no debe compartirse con archivos del usuario.
Compose monta volúmenes de originales y staging con el UID no root de la API.
El setup local completo vive en [README API](../apps/api/README.md).

`MEDIA_STORAGE=s3` exige endpoint, región, bucket, access key y secret key mediante
`MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY`,
`MEDIA_S3_SECRET_KEY`. Endpoint HTTPS; HTTP solo loopback para prueba local. Config
pública exige S3 para evitar filesystem efímero. Aprovisionar **por separado** bucket
privado y permisos mínimos de objetos Get/Put/Delete en el prefijo `photos/`.
La API no crea bucket ni cambia ACL/políticas. No concede acceso anónimo ni configura CDN.
Usa S3 V4, región explícita, endpoint configurable y PUT atómico con tamaño conocido,
sin multipart remoto; R2, Railway Buckets y AWS son proveedores objetivo compatibles,
no servicios externos probados o creados en PR10. URLs y credenciales van por config
local/secrets de la instalación, nunca por browser persistent storage ni Git.

No cambiar backend/root/bucket esperando una migración automática. Filas de otro
backend se muestran pendientes y no se leen del proveedor actual. Una instalación
no sincroniza con otra. No hay purga automática ni garantía de durabilidad del
proveedor/costo cero; backups de DB **y objetos** corresponden a PR11.

## Fallos y reconciliación

El servidor valida/stagea primero, confirma metadata `pending`, escribe/verifica
objeto y confirma `ready`; después intenta la miniatura. DB y object store no
comparten transacción. Un fallo de metadata previo no escribe un original; un fallo
al confirmar `ready` deja original recuperable y fila pendiente. El uploader mantiene
un advisory lock PostgreSQL por UUID entre esos pasos; crash libera el lock.
Local usa archivo temporal, fsync y rename; S3 stagea en disco y hace un solo PUT.
Un reader interrumpido no sustituye un objeto existente.

Ejecutar explícitamente, con la configuración de esa instalación:

```bash
pnpm --filter @cubeos/api exec go run ./cmd/server media-reconcile
# Compose preparado:
docker compose -f infra/docker/compose.yaml exec api server media-reconcile
```

Reconciliación considera hasta 100 filas pendientes/sin miniatura de ese backend,
mayores de un minuto. Ordena por último intento (o importación inicial), rotando
los pendientes ausentes para que no bloqueen fotos recuperables posteriores.
Adquiere lock sin esperar un upload activo, verifica tamaño/SHA
y recupera `ready`/miniatura. Un original ausente o distinto permanece pendiente;
no inventa readiness ni borra originales. Las consultas detectan originales ausentes
y degradan metadata. Staging `stage-UUID` de más de 24 horas y temporales locales
`.upload-hex` de directorios ligados a esas filas se limpian; archivos con otros
nombres y objetos ajenos no se enumeran/purgan. El comando tiene deadline de 30 min.
Inspeccionar pendientes que no se recuperan y volver a ejecutar tras resolver la
causa. No elimina metadata ni realiza una migración de proveedores.

## Evidencia reproducible

CI `media-postgres-s3-browser`, requerido por `ci-required`, usa PostgreSQL,
credenciales efímeras y la imagen oficial [RustFS](https://docs.rustfs.com/en/installation/container)
`1.0.0-rc.6-glibc` fijada por digest como servidor de **prueba** S3. El contrato
compartido filesystem/S3 verifica bytes, abort, delete, claves y denegación anónima;
DB real prueba fallos/recovery y HTTP dueño/credenciales. Browser firmado y runtime
Next cubren importación/paginación/descarga y cambios de cuenta/dispositivo/logout.
Gate serial reinicia API/DB/S3 y conserva el original exacto en volúmenes propios.
El smoke Compose conserva original/SHA offline además de los gates anteriores.
No se ha probado hardware físico, Clerk externo ni un bucket cloud de producción.
