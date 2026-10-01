# SQLite para historial de telemetría

La telemetría debe persistirse para historial y depuración. Estimación: una Muestra cada 500 ms, ~172 800 registros por día, sin servidores dedicados en la etapa educativa.

**Decisión:** SQLite con SQLAlchemy en `apps/api` (Sprint 2). El ORM debe permitir migrar a PostgreSQL cambiando la cadena de conexión. No aplica al Sprint 1.

**Status:** superseded by [0005-backend-local-cloud-media.md](0005-backend-local-cloud-media.md). Se conserva como antecedente; el backend de esta etapa no llegó a implementarse.

## Considered Options

| Alternativa | Resultado | Motivo |
| --- | --- | --- |
| SQLite | Elegida | Archivo único, sin infraestructura, suficiente al volumen inicial. |
| PostgreSQL | Reservada a producción | Complejidad antes de tiempo. |
| MongoDB | Descartada | Datos tabulares de forma fija. |
| InfluxDB | Descartada | Complejidad desproporcionada para la etapa educativa. |

## Consequences

No hace falta un servidor de base de datos en Sprint 2. SQLite no sirve para escritura concurrente intensa; ese escenario no es requisito. El esquema inicial está en [docs/telemetry.md](../telemetry.md).
