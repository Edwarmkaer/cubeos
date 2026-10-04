# Progreso de construcción

La guía común vive en `steps`. El progreso vive en `step_progress`, único por
`(device_id, step_id)`. Los IDs UUID son permanentes; el orden de presentación
no es identidad. La propiedad se comprueba en Go/PostgreSQL tanto al leer como
al guardar. El principal local persistente o la sesión Clerk inscrita acceden a
sus propios dispositivos; las credenciales de ingestión no conceden este acceso.
Autenticación pública: [identidad pública](public-auth.md).

## API y persistencia

El contrato de rutas y JSON tiene dueño en
[OpenAPI](../packages/contracts/openapi/telemetry.yaml):
`GET /api/v1/steps`, `GET /api/v1/devices/{id}/progress` y
`PUT /api/v1/devices/{id}/steps/{stepId}` con exactamente
`{"completed":true}` o `{"completed":false}`.

Marcar conserva la primera fecha de completado, incluso con peticiones repetidas.
Desmarcar elimina el completado y devuelve fecha nula; marcar después genera una
nueva fecha del servidor. El total y porcentaje se derivan de los pasos existentes
en la misma lectura, nunca de una columna de porcentaje. Un catálogo vacío tiene
total/completados/porcentaje cero. Añadir pasos aumenta el denominador; reordenarlos
conserva el completado por ID. Borrar un paso elimina su progreso por FK: no reutilizar
su ID para otro contenido. Cambiar propietario no es una operación pública disponible.

PostgreSQL debe conservar su volumen. Las migraciones versionadas usan el checksum,
transacción y advisory lock existentes; no editar migraciones ya aplicadas. Preparación
local y Compose: [API](../apps/api/README.md).

## Publicar una guía aprobada

Edwar validará el contenido y el orden de los pasos (confirmado el 2026-10-03).
Esta designación no equivale a una guía ya aprobada. La revisión física del CubeSat
que representará la guía sigue pendiente de identificar al recibir sus archivos.

Las migraciones de producción no insertan pasos. Mientras CHASQUI-II no entregue
contenido educativo aprobado, Construcción muestra **Guía en preparación**. Los
catálogos de fixtures solo se insertan en bases descartables de tests.

Un operador con acceso administrativo a la DB puede cargar un archivo SQL revisado,
con contenido aprobado y UUIDs estables generados una sola vez. Guardar ese archivo
con la evidencia de aprobación; usar parámetros/escapado SQL adecuado al contenido.
No existe endpoint administrativo público. Para la instalación Compose propia:

```bash
docker compose -p <instalacion> -f infra/docker/compose.yaml exec -T db \
  psql -v ON_ERROR_STOP=1 -U cubeos -d cubeos < guia-aprobada.sql
```

El archivo debe envolver sus INSERT/UPDATE en `BEGIN;` y `COMMIT;`.
Columnas: `id` UUID, `title` (1–200 caracteres), `instructions` (1–10000)
y `display_order` entero no negativo. Título/instrucciones no pueden quedar vacíos.
Para reordenar, actualizar únicamente `display_order` de los IDs existentes.
Para corregir texto, actualizar el mismo ID solo si sigue representando el mismo
paso. No truncar tablas ni regenerar IDs al volver a cargar la guía. Se renderiza
texto plano, sin HTML ni instrucciones de fixture para alumnos.

## Cliente web

Construcción usa el CubeSat seleccionado en Configuración. Carga el progreso real,
guarda cada casilla y permite recargar tras un error. No conecta telemetría para
completar pasos ni ofrece progreso DEMO. La casilla y porcentaje se actualizan tras
confirmación del servidor; no confundir **Guardando** con completado persistido.
Cambiar fuente/dispositivo/cuenta cancela las operaciones y descarta sus resultados
por generación. Una escritura ya confirmada por la DB puede persistir aunque se
cancele su respuesta; recargar consulta la verdad del servidor. Logout borra la vista.
Las fechas se muestran en la zona del navegador. No se añade simulador de armado 3D.

## Verificación

`TestConstructionPersistedIdentityAndOwnership` requiere una DB exclusiva mediante
`TEST_CONSTRUCTION_DATABASE_URL`. El gate separado
`TestConstructionSignedBrowser` usa `CUBEOS_CONSTRUCTION_BROWSER=1` y
`TEST_CONSTRUCTION_BROWSER_DATABASE_URL`; solo sustituye el proveedor externo
con JWT/JWKS efímeros, mantiene Go, propiedad, DB y cliente reales.
`infra/docker/smoke.sh` sobre una instalación descartable comprueba la igualdad
de progreso/fechas tras recrear API y DB con el mismo volumen, también sin egress.
Nunca ejecutar estas pruebas en una DB de alumnos.
