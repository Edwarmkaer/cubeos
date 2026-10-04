# Preparación de las escenas 3D

Esta entrega prepara la relación con el diseño 2D; no instala un motor 3D ni
añade modelos inventados. La primera visualización de armado y las animaciones
posteriores pertenecen al [issue #16](https://github.com/Edwarmkaer/cubeos/issues/16).

## Separación de responsabilidades

- `cubeos-components.lib.pen`: controles y presentación reutilizables.
- `construccion.pen`: disposición de instrucciones, piezas, viewport, navegación,
  avance y fallback; vistas de referencia del modelo cuando exista.
- Archivo editable 3D + GLB: geometría, materiales, jerarquía de piezas y pivotes.
- React: selección del paso, controles y coordinación con la API existente.
- Visor 3D: cámara, visibilidad y resaltado; movimiento solo donde se apruebe.

El visor de armado y la orientación de telemetría son casos distintos. El
contrato v2 no aporta actitud derivada; no usar giroscopio °/s como ángulos.

## Recepción de assets

El formato, escala, nombres de nodos y fuentes editables tienen su dueño en la
[hoja de ruta](../../../docs/frontend-local-roadmap.md#entrega-recomendada-de-modelos-para-16).
Registrar al recibirlos: revisión física, autor/licencia, dimensiones de referencia,
inventario de nodos, bytes, texturas y capturas. Edwar valida el paso a paso según
[construcción](../../../docs/construction-progress.md).

La asociación futura es UUID estable de paso → IDs estables de piezas/nodos.
No usar índices de presentación como identidad; no añadir sesiones ni proyectos
de armado. Explorar un paso o terminar una animación no completa el paso en la API.

## Estados de diseño a resolver antes del PR 3D

Modelo ausente, cargando, listo, fallo de carga, WebGL no disponible, movimiento
reducido y controles de teclado. El texto y el progreso seguirán disponibles sin
canvas. Assets locales, sin CDN obligatorio para la instalación offline preparada.
Con el modelo real se fijarán presupuestos de descarga, memoria y fluidez en móvil.
Blender puede preparar el asset; Triplex se evaluará solo si facilita la edición
de la escena real. No son dependencias necesarias del taller Pencil.
