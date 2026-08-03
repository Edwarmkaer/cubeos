# ADR-002 — Base de datos

- Estado: aceptada
- Fecha: 2026-05
- Autores: CHASQUI-II — UNI

## Contexto

La telemetría debe persistirse para consultar el historial de vuelo y realizar depuración. La estimación inicial es una muestra cada 500 ms, aproximadamente 172 800 registros por día, sin infraestructura de servidores dedicada para la etapa educativa.

## Decisión

Usar **SQLite** con **SQLAlchemy** como ORM. La separación mediante ORM debe permitir migrar a PostgreSQL cambiando el string de conexión cuando el contexto de producción lo requiera.

## Alternativas consideradas

| Alternativa | Resultado | Motivo |
| --- | --- | --- |
| SQLite | Elegida | Archivo único, sin infraestructura adicional y suficiente para el volumen inicial. |
| PostgreSQL | Reservada para producción | Añade complejidad antes de que sea necesaria. |
| MongoDB | Descartada | Los datos son tabulares y de forma fija. |
| InfluxDB | Descartada | Complejidad desproporcionada para la etapa educativa. |

## Consecuencias

- No se requiere infraestructura de base de datos durante el Sprint 2.
- La migración futura no debería exigir cambios en FastAPI ni en el frontend.
- SQLite no se considera adecuada para cargas intensivas de escritura concurrente, escenario que no es requisito actual.

El esquema inicial se documenta en [telemetría y sensores](../Arquitectura/telemetria-y-sensores.md).
