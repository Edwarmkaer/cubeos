# Decisiones abiertas

Actualización 2026-10-01: la tabla siguiente conserva dudas del simulador anterior, no decisiones vigentes de arquitectura. Backend, persistencia, medios y realtime se resuelven en el [diseño consolidado](superpowers/specs/2026-10-01-cubeos-backend-design.md) y ADR 0005. En v2 hay presión/luz, temperaturas separadas y velocidades angulares, no ángulos Euler. Construcción usa pasos y progreso por dispositivo. Permanecen pendientes umbrales y curva de batería/campo de Paneles.

Para hardware se confirmarán framing, baudrate y protocolo Wi-Fi de la ESP32 receptora. Para fotografías se empieza con archivos importados o HTTP; UART binario exige acuerdo de framing, fragmentación, checksum y pruebas de rendimiento. No se necesita cerrar estas decisiones de campo para comenzar PR 0 y contratos. Remoto GitHub y cuentas/bucket/secretos son requisitos de publicación/despliegue, no de modelado local.

No convertir estas preguntas en requisitos implícitos. Al resolver una, actualizar el documento dueño y, si cambia una decisión aceptada, crear un ADR nuevo que indique cuál sustituye.

| ID | Decisión | Evidencia actual | Impacto | Resolución necesaria |
| --- | --- | --- | --- | --- |
| D-001 | ¿Se incluyen `pressure` y `luz` en el MVP? | Están en el catálogo y en wireframes; no en SQLite, store ni los doce campos. | Contrato, persistencia y tarjetas. | Confirmar inclusión y, de ser así, actualizar telemetry y ADR 0002. |
| D-002 | ¿`gyro_roll`, `gyro_pitch` y `gyro_yaw` son ángulos o velocidades angulares? | El catálogo usa grados y los vincula a rotación 3D; un resumen antiguo menciona °/s. | Cálculo del visor 3D. | Semántica, ejes, sistema de referencia y normalización. |
| D-003 | ¿La temperatura es interna, externa o ambas? | El catálogo dice “interna/externa” con un único campo `temperature`. | Etiqueta del Visor y posible evolución del contrato. | Origen y si hacen falta campos separados. |
| D-004 | ¿Cuáles son los umbrales visuales? | El Visor pide normal/alerta/crítico; solo hay rangos esperados. | Estados de tarjetas. | Límites por variable y comportamiento ante dato inválido. |
| D-005 | ¿Qué alcance tienen Construcción, Configuración y las expansiones (cámara, baterías)? | Hay wireframes; faltan flujos, actores y criterios. | Navegación y backlog. | Documentar contenido educativo, datos y acciones por superficie. |
| D-006 | ¿Cuál será el protocolo WebSocket? | La arquitectura fija FastAPI, WebSocket y JSON. | Integración Sprint 2. | Endpoint, envelopes, validación, reconexión y versión de mensaje. |
| D-007 | ¿Cómo se calcula el nivel de batería de CubeSat y Paneles? | El usuario confirmó que se deriva del voltaje, pero faltan química, cantidad de celdas, rango útil y si son dos mediciones independientes. | Contrato de datos, porcentaje y estados del indicador. | Confirmar campos de voltaje, unidad, rangos vacío/lleno y tratamiento durante carga. |
| D-008 | ¿Cómo llegan y se conservan las capturas de Cámara? | El Visor requiere una galería; los doce campos no incluyen imágenes ni metadatos. | Endpoint, historial, miniaturas, descarga y persistencia. | Definir URL/binario, fecha, resolución, tamaño, límite del historial y política de almacenamiento. |
