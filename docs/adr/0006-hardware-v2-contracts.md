# Separar el contrato hardware v2 de la demo legacy

**Status:** proposed para revisión del PR2; aplica la política ya establecida en
el diseño consolidado y no cambia el stack aceptado del ADR 0005.

El contrato de doce campos de la demo contiene ángulos, índice UV y altitud
sintéticos. La entrega Chasqui v2 contiene tramas por grupo y velocidades
angulares. `packages/contracts` conserva el esquema y los ejemplos originales,
formaliza el snapshot legible y aporta fixtures comunes TypeScript/Go. La demo
legacy permanece separada hasta migrar web en PR7.

Se prefiere validar el esquema intacto y registrar discrepancias frente a relajar
campos obligatorios según la guía: modificarlo silenciosamente haría que firmware
y backend aceptasen contratos distintos. Ausencia se conserva distinta de cero;
no se deriva Euler, índice UV ni porcentaje de batería. Metadatos de receptor y
frescura permanecen fuera del payload original y del snapshot legible.

Enmienda el ADR [0003](0003-monorepo-multipaquete.md) en su afirmación de que
`packages/telemetry` es la única fuente de contrato: ahora solo gobierna la demo.
ADR [0002](0002-sqlite-telemetry.md) ya fue sustituido por
[0005](0005-backend-local-cloud-media.md); no se restaura SQLite ni FastAPI.
Unidades y discrepancias: [telemetría](../telemetry.md).
