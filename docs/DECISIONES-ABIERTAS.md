# Decisiones abiertas

Estas preguntas provienen de la consolidación del vault de proyecto. Deben resolverse antes de convertir la documentación en contratos de implementación.

| ID | Decisión | Evidencia actual | Impacto | Resolución necesaria |
| --- | --- | --- | --- | --- |
| D-001 | ¿Se incluyen `pressure` y `luz` en el MVP? | Están en el catálogo de sensores, pero no en SQLite, el store ni la especificación de UI. | Contrato de datos, persistencia y tarjetas. | Confirmar inclusión y, de ser así, actualizar ADR-002 y frontend. |
| D-002 | ¿`gyro_roll`, `gyro_pitch` y `gyro_yaw` son ángulos de orientación o velocidades angulares? | El catálogo usa grados y los vincula a rotación 3D; el resumen antiguo menciona °/s. | Cálculo y representación del visor 3D. | Acordar semántica, ejes, sistema de referencia y normalización. |
| D-003 | ¿La temperatura es interna, externa o ambas? | El catálogo la denomina “interna/externa” con un único campo `temperature`. | Etiquetado de la UI y posible evolución del contrato. | Definir origen y si se requieren campos separados. |
| D-004 | ¿Cuáles son los umbrales visuales? | La UI requiere normal/alerta/crítico, pero solo existen rangos esperados. | Estados de las tarjetas y alertas. | Definir límites por variable y comportamiento ante dato inválido. |
| D-005 | ¿Qué alcance tienen Construcción, Configuración y las expansiones? | Existen wireframes, pero no requisitos funcionales equivalentes. | Navegación, backlog y criterios de aceptación. | Documentar flujos, actores, datos y acciones por pantalla. |
| D-006 | ¿Cuál será el protocolo WebSocket? | La arquitectura solo fija FastAPI, WebSocket y JSON. | Integración Sprint 2 y manejo de errores. | Definir endpoint, envelopes, validación, reconexión y versión de mensaje. |

## Regla de cierre

Al resolver una decisión, se debe actualizar el documento afectado y, si modifica una decisión técnica aceptada, crear un ADR nuevo que indique cuál sustituye.
