# Decisiones abiertas

Actualización 2026-10-01: la tabla siguiente conserva dudas del simulador anterior, no decisiones vigentes de arquitectura. Backend, persistencia, medios y realtime se resuelven en el [diseño consolidado](superpowers/specs/2026-10-01-cubeos-backend-design.md) y ADR 0005. En v2 hay presión/luz, temperaturas separadas y velocidades angulares, no ángulos Euler. Construcción usa pasos y progreso por dispositivo. Permanecen pendientes umbrales y curva de batería/campo de Paneles.

Para hardware se confirmarán framing, baudrate y protocolo Wi-Fi de la ESP32 receptora. Para fotografías se empieza con archivos importados o HTTP; UART binario exige acuerdo de framing, fragmentación, checksum y pruebas de rendimiento. No se necesita cerrar estas decisiones de campo para comenzar PR 0 y contratos. Remoto GitHub y cuentas/bucket/secretos son requisitos de publicación/despliegue, no de modelado local.

No convertir estas preguntas en requisitos implícitos. Al resolver una, actualizar el documento dueño y, si cambia una decisión aceptada, crear un ADR nuevo que indique cuál sustituye.

| ID | Decisión | Evidencia actual | Impacto | Resolución necesaria |
| --- | --- | --- | --- | --- |
| D-001 | Resuelta en hardware v2 | Presión e iluminancia incluidas; campos en [telemetría](telemetry.md). | Migración de widgets en PR7. | No extender el contrato legacy. |
| D-002 | Resuelta en hardware v2 | Giroscopio mide velocidad angular; ángulos de demo sintéticos. | Visor 3D no puede derivar actitud renombrando ejes. | Pendiente calibración/referencia si se quiere calcular orientación. |
| D-003 | Resuelta en hardware v2 | Temperaturas de sensores separadas; TMP102 opcional sin confirmar. | Etiquetas de lecturas. | Confirmar instalación TMP102 con hardware. |
| D-004 | ¿Cuáles son los umbrales visuales? | El Visor pide normal/alerta/crítico; solo hay rangos esperados. | Estados de tarjetas. | Límites por variable y comportamiento ante dato inválido. |
| D-005 | ¿Qué alcance tienen Construcción, Configuración y las expansiones (cámara, baterías)? | Hay wireframes; faltan flujos, actores y criterios. | Navegación y backlog. | Documentar contenido educativo, datos y acciones por superficie. |
| D-006 | Realtime resuelto como SSE en arquitectura objetivo | ADR 0005 y plan PR6. | Cliente autenticado y reconexión. | Implementación pendiente; confirmar framing/baudrate y transporte Wi-Fi con receptor. |
| D-007 | ¿Cómo se calcula el nivel de batería de CubeSat y Paneles? | El usuario confirmó que se deriva del voltaje, pero faltan química, cantidad de celdas, rango útil y si son dos mediciones independientes. | Contrato de datos, porcentaje y estados del indicador. | Confirmar campos de voltaje, unidad, rangos vacío/lleno y tratamiento durante carga. |
| D-008 | Transporte de fotos resuelto para primera entrega | Importación/HTTP, almacenamiento local/S3 según ADR 0005. | Implementación PR10 independiente de estado de cámara. | UART binario pendiente de framing/checksum/tamaño y rendimiento. |
| D-009 | ¿Cómo armonizar guía y esquema entregados? | Omitir fallidos contradice campos obligatorios; fx=1 permitido; bt ausente. Tratamiento en [telemetría](telemetry.md). | Rechazos por esquema conservan causa. | Confirmar revisión futura con equipo; no modificar v2 silenciosamente. |
