# Documentación del proyecto

Esta documentación consolida la información técnica del proyecto CubeSat Educacional de CHASQUI-II — UNI. Es la referencia de desarrollo para la plataforma web de visualización de telemetría; no incluye aún código de aplicación.

## Índice

| Área | Documento | Estado |
| --- | --- | --- |
| Producto | [Contexto y objetivos](Producto/contexto-y-objetivos.md) | Consolidado |
| Arquitectura | [Arquitectura del sistema](Arquitectura/arquitectura-del-sistema.md) | Consolidado |
| Telemetría | [Sensores y contrato de datos](Arquitectura/telemetria-y-sensores.md) | Consolidado con pendientes |
| Frontend | [Especificación](Frontend/especificacion.md) | Consolidado |
| Frontend | [Wireframes](Frontend/README.md) | Referencia visual |
| Decisiones | [ADR-001 — Stack frontend](ADR/ADR-001-stack-frontend.md) | Aceptada |
| Decisiones | [ADR-002 — Base de datos](ADR/ADR-002-base-de-datos.md) | Aceptada |
| Pendientes | [Decisiones abiertas](DECISIONES-ABIERTAS.md) | Requiere resolución |

## Convenciones

- Los nombres de variables de telemetría se escriben en `snake_case`.
- Las decisiones aceptadas se conservan como ADR; un cambio posterior debe crear un ADR nuevo que las sustituya.
- La información no resuelta se registra en `DECISIONES-ABIERTAS.md`, sin convertirla en un requisito implícito.
