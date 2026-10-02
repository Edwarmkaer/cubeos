# Backup y restauración de DB y objetos

`apps/api/cmd/recovery` e imagen `infra/recovery/Dockerfile` empaquetan recovery y
clientes PostgreSQL 17.6. No crean/borran DBs, buckets ni volúmenes. No ejecutan
`--clean` ni sobrescriben una instalación. Dumps, manifest y fotos contienen datos
privados y hashes de credenciales: directorios 0700, archivos 0600; conservarlos
cifrados fuera del repositorio con acceso restringido y capacidad supervisada.
El checksum detecta corrupción, no autentica un archive malicioso: restaurar
solo copias confiables de esta instalación. No publicar archives como artifacts CI.

## Consistencia y backup

No existe transacción distribuida DB+S3/filesystem. El procedimiento requiere una
ventana de mantenimiento, sin aplicaciones, ingestión, reconcilers ni escritores
directos del bucket/DB. No es backup online ni sincronización local/cloud.

1. Detener nuevas cargas/recepción, drenar uploads (deadline actual en
   [medios](media.md)), detener **todas** las réplicas API, serial, jobs y escritores
   externos; mantener PG y object store disponibles. No basta cerrar la web.
2. Ejecutar `server media-reconcile` con config de esa instalación mientras la API
   sigue detenida. Repetir lotes según los pendientes/derivados a reparar; cerrar
   el comando. Inspeccionar pendientes que no se recuperan, sin borrar evidencia.
3. Preparar `RECOVERY_*` de origen en envfile privado 0600. DB explícita directa
   de la instalación; objetos del mismo backend/root/bucket, no un bucket compartido.
4. Ejecutar backup con `--writers-stopped`. Rechaza cualquier otro cliente DB,
   toma advisory lock de recovery y SHARE NOWAIT de tablas public, exporta snapshot
   repeatable-read para `pg_dump` y copia inventario del store. El operador debe
   impedir nuevos escritores durante toda la ventana; ningún lock PG bloquea a
   un cliente S3 independiente. Cuantificar la duración en la instalación real.
5. Validar exit 0 y `manifest.json` completo, sin `INCOMPLETE`; mantener la copia
   privada en otro medio. Retomar escritores únicamente tras terminar esa ventana.

Se incluye dump **de datos y esquema**, identities, propiedad, IDs/fechas de pasos
y progreso, metadata/hashes/revocación de credenciales, raw/history, estados de
orden, snapshots y metadata/fotos. Cada objeto lleva tamaño/SHA; originales listos
se comparan con DB. Miniaturas separadas y objetos huérfanos con claves válidas
también se conservan. Pendiente con original ausente conserva fila pendiente, no
inventa bytes. Un original ready ausente/distinto o miniatura referenciada ausente
rechaza backup: reparar/registrar inconsistencia antes de repetir. Inventory final
y segunda lectura verifican ausencia de cambios durante la copia.

Solo admite claves internas `photos/UUID/original|thumbnail`; archivos desconocidos,
symlinks o buckets compartidos se rechazan. Límite de inventory 100000 objetos,
256 MiB por objeto, trabajo máximo 2 horas: una instalación mayor requiere un
procedimiento ampliado, nunca omitir objetos silenciosamente. `MEDIA_TEMP_ROOT`
no se respalda: solo staging regenerable. Un intento fallido conserva `INCOMPLETE`;
reintentar hacia **otro directorio nuevo**, sin sobrescribir evidencia previa.

```bash
docker build -f infra/recovery/Dockerfile -t cubeos-recovery:prepared .
# Ejemplo local propio: montar archive y raíz persistente con sus mismas rutas.
# La red debe permitir solo PG/S3 necesarios; no ejecutar en un volumen ajeno.
docker run --rm --user "$(id -u):$(id -g)" --network <red-de-esta-instalacion> \
  --env-file /ruta/privada/recovery-source.env \
  -v /ruta/privada/copias:/ruta/privada/copias \
  -v /ruta/persistente/media:/ruta/persistente/media:ro \
  cubeos-recovery:prepared backup /ruta/privada/copias/copia-nueva --writers-stopped
```

Native: preparar `pg_dump`/`pg_restore`/`psql` 17 y `go build -o /ruta/recovery ./cmd/recovery`
desde `apps/api`, cargar envfile confiable sin echo/xtrace, ejecutar el mismo comando.
Con TLS remoto usar URL/certificados verificados. No poner password en argv.

## Variables exclusivas de recovery

| Variable | Requisito |
| --- | --- |
| `RECOVERY_DATABASE_URL` | URL postgres explícita con usuario, host, DB y TLS apropiado; jamás hereda `DATABASE_URL` |
| `RECOVERY_STORAGE` | `local` o `s3`, sin default; mismo backend que archive |
| `RECOVERY_LOCAL_ROOT` | Ruta absoluta sin symlinks, exclusiva; restore exige basename `cubeos-restore-<UUID>` |
| `RECOVERY_S3_ENDPOINT`, `RECOVERY_S3_REGION`, `RECOVERY_S3_BUCKET` | Config privada explícita; endpoint HTTPS (HTTP solo IP loopback para test) |
| `RECOVERY_S3_ACCESS_KEY`, `RECOVERY_S3_SECRET_KEY` | Secrets del bucket exclusivo; no imprimir/configurar en browser |
| `RECOVERY_TEMP_ROOT` | Staging exclusivo en disco con capacidad, montar/configurar TMPDIR preparado si corresponde |

No usa Clerk ni requiere autenticar alumnos durante recovery. Son credenciales
administrativas de DB/objetos, distintas de bearer/credenciales de fuentes.
La herramienta solo emite diagnóstico fijo, no SQL privado, URLs ni secretos.

## Restore a instalación nueva

1. Crear explícitamente una DB **vacía y descartable** `cubeos_restore_<32 hex>`
   y raíz nueva `cubeos-restore-<UUID>` o bucket privado vacío con ese nombre.
   No renombrar la DB/bucket de producción para sortear esta barrera. Mantener
   API/escritores de destino detenidos; no ejecutar migraciones antes de restore.
2. Preparar otro envfile `RECOVERY_*` solo de destino. Configurar provider compatible
   con el mismo backend: local→local o s3→s3, nunca conversión automática de filas.
   Proveedores S3 pueden diferir si se conservan claves/bytes y bucket privado.
3. Ejecutar `restore ARCHIVE --new-disposable-target`. Valida nombre/ruta antes de
   crear directorios; exige DB sin clientes, relaciones, funciones, tipos, schemas
   ajenos o extensiones adicionales y store vacío. Rechaza targets implícitos.
4. Verifica **todo** el archive antes de mutar destino. Copia/verifica objetos primero.
   `pg_restore --no-owner --no-privileges` genera SQL en un temporal privado 0600;
   `psql --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1` ejecuta ese SQL y
   cruza filas `photos` con el inventario verificado **antes del commit**: backend,
   original ready presente, tamaño/SHA de todo original presente y cada miniatura
   referenciada presente. Omisión de un objeto en manifest y metadatos distintos
   revierten la misma transacción y limpian solo objetos de ese intento. Pending
   sin original y miniatura NULL siguen permitidos. El temporal se elimina al
   terminar; disponer de espacio privado en disco para SQL sin comprimir (`TMPDIR`).
   Mantiene metadata/IDs/hashes/fechas. Roles/globales no se restauran: configurar
   acceso administrativo/app en ese nuevo destino por separado.
5. Verificar migraciones (`/readyz` o comando migrate del mismo SHA), conteos,
   propiedad A/B, progreso/fechas, historial/raw, snapshot/rebuild y downloads SHA.
   Ejecutar reconciliación antes de aceptar pendientes y regenerar derivados si
   corresponde. Solo después habilitar **esa nueva instalación**; cambio a producción
   requiere otro encargo del propietario. No hay reemplazo automático.

```bash
# UUIDs/nombres se generan una vez para un destino realmente nuevo.
docker run --rm --user "$(id -u):$(id -g)" --network <red-del-destino-nuevo> \
  --env-file /ruta/privada/recovery-target.env \
  -v /ruta/privada/copias:/ruta/privada/copias:ro \
  -v /ruta/nueva/cubeos-restore-<UUID>:/ruta/nueva/cubeos-restore-<UUID> \
  cubeos-recovery:prepared restore /ruta/privada/copias/copia-nueva --new-disposable-target
```

Fallo ordinario revierte DB en su transacción y elimina únicamente objetos de
ese intento en el destino inicialmente vacío; corregir permiso/capacidad y
reintentar solo si sigue vacío. Crash/cancelación o cleanup fallido puede dejar
objetos; retry rechaza destino ocupado. Conservar evidencia y usar **otro destino
nuevo**; no hay borrado global ni opción force/overwrite. Si DB ya fue confirmada,
una respuesta incierta también obliga a inspección/nuevo destino, nunca retry
destructivo. Backups del volumen PG del proveedor no sustituyen esta pareja DB+objetos.

## Gate reproducible

`bash infra/recovery/tests/run.sh` desde raíz crea sus propios PG/S3 privados,
usa credenciales efímeras y conserva volúmenes; requiere Docker/BuildKit, Go fijado,
Python/openssl y scratch en disco (`CUBEOS_RECOVERY_SCRATCH`, puertos opt-in).
Prueba datos no vacíos A/B, pasos/progreso, historial válido/rechazado, fuentes,
credenciales, fotos/miniaturas; igualdad de cada tabla, SHA, reconstrucción y permisos
restaurados. Incluye corrupción, cliente activo, objetos/DB ocupados, rechazo
de destino, fallo real de permisos de restauración con rollback/cleanup y retry,
y CLI local/S3 con dump/checksums válidos pero original/miniatura omitidos o
tamaño/SHA distintos de metadata, sin commit parcial y con retry íntegro.
Después ejercita la imagen recovery real, PORT/readiness/migraciones/no-root y
auth runtime de imágenes web/API, más SSE firmado detrás de proxy TLS.
Cloud real sigue pendiente según [deployment](deployment.md).
