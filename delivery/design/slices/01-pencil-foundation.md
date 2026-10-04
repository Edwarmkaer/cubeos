# Base Pencil — primer PR propuesto

Issue: [#14](https://github.com/Edwarmkaer/cubeos/issues/14). Base: `79d9c59`.
Título propuesto: **Preparar la biblioteca y las superficies de CubeOS en Pencil**.

Edwar autorizó esta extracción y la arquitectura de biblioteca acumulativa.
Rama de entrega: `design/pencil-foundation`; publicación del PR autorizada.
No hay aprobación de un rediseño ni cambios en el comportamiento del frontend.

La entrega incluye `cubeos-components.lib.pen` y los cinco consumidores por
flujo. El [inventario](../inventory/ui-current.md) es dueño de sus IDs y límites;
el [mapa](../pencil/component-map.json) relaciona maestros con código.
`packages/ui` conserva las primitivas de runtime y su autoridad sobre tokens.
Las composiciones y widgets específicos permanecen en sus archivos de flujo.

Verificación del slice: apertura y renderizado por el CLI oficial, componentes
compartidos resueltos, prueba reversible de propagación a las cinco superficies,
reapertura con el texto original y prueba de traslado de la biblioteca junto a
un consumidor. Las capturas exportadas son evidencia del canvas, no del runtime.
El inventario distingue efectos no transferidos y estados con backend aún no
capturados. No se probaron flujos de escritura ni se instalaron motores 3D.

Comprobaciones de entrega: enlaces internos, JSON del inventario/mapa, rutas de
código, 13 exportaciones y `git diff --check`. `pnpm test` pasó con Go disponible
en el PATH del proceso (cuatro tareas Turbo reutilizaron caché). Esa ejecución
local no certifica los gates de integración con PostgreSQL/S3; su resultado se
consulta en el CI del PR.

Siguiente entrega: proponer y revisar Configuración en `configuracion.pen`,
aplicando el [plan del milestone](../../../docs/frontend-local-roadmap.md).
La UI propuesta todavía necesita aprobación; esta base no cierra #14.
