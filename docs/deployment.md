# Preparación de Railway

PR11 prepara configuración e imágenes; **no acredita un despliegue**. No crea
cuentas, servicios, dominios, buckets, proyectos Google/Clerk ni secrets externos.
La aceptación pública requiere destino y cuenta de prueba autorizados.
Local y nube siguen siendo instalaciones independientes.

## Topología y configuración

`infra/railway/railway.ts` usa `railway@3.12.0` fijado en el lockfile. Declara
web/API desde GHCR `sha-<SHA completo>` sin actualización automática y PostgreSQL
17.6 con intención persistente y referencia privada DB→API. No declara bucket:
el propietario selecciona uno privado R2, Railway Buckets o AWS S3. Una réplica
por servicio; staging temporal regenerable, originales/miniaturas solo en S3.

La documentación actual indica que nuevos servicios usan IaC; `railway.json`
legacy está deprecated. El gate evalúa el SDK sin red. Aplicar el grafo y comprobar
provisión persistente sigue pendiente externa.
[IaC oficial](https://docs.railway.com/infrastructure-as-code),
[referencia](https://docs.railway.com/infrastructure-as-code/reference).

```bash
pnpm install --frozen-lockfile
node --experimental-strip-types --test infra/railway/config.test.mjs
# Solo tras autorización y vinculación del entorno correcto:
CUBEOS_IMAGE_SHA=<sha-completo-publicado> railway config plan --file infra/railway/railway.ts
# Revisar plan; apply/provisión requiere autorización aparte.
```

No ejecutar `config pull --include-variables` ni `plan --show-values` con secretos.
`preserve()` necesita un valor existente en el servicio; no es un default.

## Secuencia del propietario

1. Seleccionar proyecto, entorno separado staging/producción, región, cuota y
   alertas. Deshabilitar autodeploy de PRs con secrets de producción. Elegir SHA
   publicado desde main/tag confiable, no `latest`.
2. Aprovisionar PostgreSQL persistente; confirmar mount/volumen, acceso privado,
   backups y versión 17 compatible con recovery. El helper describe intención DB;
   verificar provisión real antes de habilitar escritores. No publicar DB al
   navegador. Recovery necesita conexión directa, no pooler ni DB compartida.
3. Crear por separado el bucket privado y credenciales Get/Put/Delete en `photos/`.
   Recovery necesita ListBucket en el bucket exclusivo. No habilitar ACL pública,
   CDN ni `r2.dev`; la API no crea buckets ni cambia políticas.
4. Crear/verificar dominios HTTPS web/API; completar variables, Google/Clerk y
   enrollment según [identidad pública](public-auth.md). Secrets solo en API y
   configuración privada de recovery, nunca en build web.
5. API predeploy ejecuta `server migrate` con transacción/exclusión concurrente;
   error impide activar el nuevo deploy. `/readyz` comprueba DB y migraciones,
   no conectividad Clerk/S3. [Predeploy](https://docs.railway.com/deployments/pre-deploy-command).
6. API escucha `0.0.0.0:$PORT`; standalone web `HOSTNAME=0.0.0.0:$PORT`.
   Railway inyecta PORT. Healthcheck API `/readyz`, web `/healthz`, timeout 300 s.
   Web devuelve 503 ante modo/key pública inválidos, sin llamar al proveedor.
7. Smoke HTTPS autorizado: A/B, expiración/revocación, stream/reconnect, upload
   acotado, download SHA, reinicio y restore en destino nuevo. Registrar SHA/digest,
   entorno/fecha/resultados sin credenciales.

Healthcheck Railway solo comprueba activación; usa Host `healthcheck.railway.app`.
`RAILWAY_HEALTHCHECK=true` permite únicamente `GET /readyz` sin query en público,
sin conceder rutas de alumno. Host normal sigue siendo `PUBLIC_API_HOST`;
`X-Forwarded-Host` no concede acceso.
[Healthchecks](https://docs.railway.com/deployments/healthchecks).

## Variables por entorno

| Servicio | Configuración | Secrets privados |
| --- | --- | --- |
| Web pública | `DEPLOYMENT_MODE=public`, `HOSTNAME=0.0.0.0`, `PORT` inyectado, `CLERK_PUBLISHABLE_KEY` runtime | Ningún secret Clerk/DB/S3 |
| API pública | `DEPLOYMENT_MODE=public`, `AUTH_MODE=clerk`, `LISTEN_HOST=0.0.0.0`, `PORT`, `RAILWAY_HEALTHCHECK=true`; Host/origen/JWT según [auth](public-auth.md) | `DATABASE_URL`, `CLERK_SECRET_KEY` |
| S3 público | `MEDIA_STORAGE=s3`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`; staging `/data/media-staging` | `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` |
| Límites | `MEDIA_MAX_BYTES`, `MEDIA_MAX_PIXELS` según [medios](media.md) | Ninguno |
| Local preparado | Compose de [API](../apps/api/README.md), auth/deployment local, PG/objetos en volúmenes, sin `RAILWAY_HEALTHCHECK` | Password local propio, ninguna credencial remota requerida |
| Recovery | `RECOVERY_*` de [backups](backups.md); no hereda `DATABASE_URL`/`MEDIA_*` | DB/bucket de origen o destino nuevo explícito |

Público falla cerrado si falta Clerk/S3/origen. No seleccionar local para sortear
un fallo. No configurar USB/serial cloud. La URL HTTPS API se selecciona en
Configuración en el navegador, no se congela en build. `NEXT_PUBLIC_MAP_STYLE_URL`
sí es un argumento de build existente; no se añade un proxy same-origin.

| Proveedor | Endpoint y región |
| --- | --- |
| R2 | `https://<account-id>.r2.cloudflarestorage.com`, `auto`; ajustar jurisdicción si corresponde |
| Railway Buckets | Valores exactos entregados en configuración del bucket; no adivinar hostname/región |
| AWS S3 | `https://s3.<region>.amazonaws.com`, región real del bucket |

[R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/),
[Railway Buckets](https://docs.railway.com/guides/storage-buckets-guide).
RustFS privado en CI prueba S3 compatible, no cada proveedor externo.

## HTTPS, proxy y recursos

Enviar credenciales/archivos directamente por HTTPS: Railway puede convertir POST
plaintext redirigido en GET. El edge termina TLS; preservar Host externo exacto,
Origin y Authorization. No exponer directamente Go público sin ese borde TLS.
Headers forwarded no autentican: JWT, sesión activa, enrollment y propiedad se
comprueban en Go. Fallo remoto nunca habilita el perfil local.

SSE necesita flush inmediato, sin buffering/cache/compresión. En un proxy adicional,
desactivar buffering en `/events`, preservar Authorization y read timeout >45 s.
Los tiempos de cliente/heartbeat/sesión pertenecen a [realtime](realtime.md).
El gate usa proxy HTTP real con terminación TLS y flush inmediato, JWT firmado,
PostgreSQL y S3 privado. No sustituye aceptación en el edge de Railway.

Railway documenta hasta 15 min con transferencia, 5 min sin datos y upload completo
en 5 min. CubeOS aplica 120 s para fotos y cuotas menores de
[medios](media.md). En otro proxy/WAF permitir multipart de
`MEDIA_MAX_BYTES + 65536` o bajar CubeOS al menor límite externo. Descargas privadas
pasan por API; no hay signed URLs ni CDN públicas. No registrar bearer/cuerpos.
[Specs del edge](https://docs.railway.com/networking/public-networking/specs-and-limits).

## Costes variables consultados el 2026-10-02

R2 Standard: $0.015/GB-mes, A $4.50/millón y B $0.36/millón; cuota mensual gratuita
10 GB-mes/1 M A/10 M B y egress R2 sin cargo. Railway Buckets: $0.015/GB-mes;
upload desde un servicio por red pública puede generar egress del servicio.
Railway documenta egress de servicio $0.05/GB, además de cómputo/DB/volúmenes/plan.
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Buckets billing](https://docs.railway.com/storage-buckets/billing),
[Railway pricing](https://docs.railway.com/pricing).

Ejemplo orientativo: 20 GB-mes R2 Standard con operaciones dentro de cuota →
10 GB-mes facturables = $0.15/mes R2. 100 GB descargados por API Railway →
aproximadamente $5 egress del servicio, antes de plan/cómputo/upload al bucket.
Originales, miniaturas y archives suman espacio. AWS depende de región/clase y
transferencia: [AWS S3 pricing](https://aws.amazon.com/s3/pricing/).
Medir cuotas/latencia Clerk por petición/heartbeat. No se promete coste cero.

## Imágenes y aceptación

`restore-railway-config` comprueba SDK, recuperación y tres imágenes en PR sin
secrets de producción/deploy; `ci-required` lo exige además de todos los gates
anteriores. `images.yml` publica web/API/recovery solo en main o tags `v*` cuyos
commits pertenecen a main, con SHA completo, tag de release y labels revision/source.
Packages:write solo en ese job; checkout sin credenciales persistidas y actions
fijadas por SHA. No hay `pull_request_target` ni secrets cloud.

Publicación GHCR efectiva se verifica tras merge/tag confiable y necesita permisos
del propietario. Verificar digest y permisos del registry al desplegar; tag por
sí solo no es inmutable. No hay despliegue automático en estos workflows.
Pendientes externos: volumen real Railway, private policies/smoke del proveedor
S3 elegido, Google/Clerk autorizado, dominios/edge TLS/SSE, presupuesto/alertas,
GHCR tras merge y primer restore cloud descartable.
