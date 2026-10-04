# Frontend local completo — hoja de ruta

Fecha: 2026-10-03. Estado: base de diseño autorizada y preparada localmente;
las propuestas de UI aplicada aún requieren revisión visual. Los números de esta
tabla son ordinales, no números de GitHub. Continuamos en este chat; no se abre
otro por cada PR.

Alcance canónico de la etapa: [milestone 1](https://github.com/Edwarmkaer/cubeos/milestone/1).
El PR #13 está integrado; backend local, fotografías y progreso ya existen.
Esta etapa no incluye hardware ni despliegue público.

## Decisiones de la conversación

- Q1 aprobada: la dirección visual de Construcción tiene dueño en
  [DESIGN.md](../DESIGN.md); conservar Pozo y adaptar el flujo de uKit.
- Q2 aprobada: primera entrega del armado con estado por paso y resaltado de
  las piezas correspondientes. Las animaciones entran después, solo donde
  ayuden a entender el montaje; no son requisito de esa primera entrega.
- Validación de guía y revisión física: [construcción](construction-progress.md).
- Edwar confirma que los archivos 3D todavía no están importados. La falta de
  assets no impide planificar ni trabajar el pulido del issue #14.

## PRs propuestos

| Orden | Issue | Entrega | Dependencia |
| --- | --- | --- | --- |
| 1 | [#14](https://github.com/Edwarmkaer/cubeos/issues/14), habilitador | Biblioteca acumulativa y cinco superficies editables en Pencil; inventario y preparación 3D | Extracción autorizada; entrega local de este Goal |
| 2 | #14 | Clarificar Configuración: fuente, CubeSat y fotografías | Propuesta visual aplicada acordada en `configuracion.pen` |
| 3 | #14 | Visor: jerarquía, datos ausentes/fallidos/antiguos, reconexión y móvil | Decidir composición móvil en `visor.pen` |
| 4 | #14 | Construcción estática: navegación, instrucciones y estados de progreso | Dirección de DESIGN aplicada y revisada en `construccion.pen` |
| 5 | [#15](https://github.com/Edwarmkaer/cubeos/issues/15) | Guía aprobada, carga repetible con UUID estables y progreso conservado | Contenido validado por Edwar |
| 6 | [#16](https://github.com/Edwarmkaer/cubeos/issues/16) | Armado por pasos, piezas resaltadas, alternativa accesible y assets locales | PR4, modelos revisados y correspondencia con PR5 |
| 7 | #16 | Animaciones de colocación seleccionadas por utilidad pedagógica | PR6; selección de movimientos posterior |
| 8 | [#17](https://github.com/Edwarmkaer/cubeos/issues/17) | Historial persistido por dispositivo/rango/campos, gráficas y CSV | Independiente del armado; reutilizar endpoints existentes |

El PR7 es una extensión posterior, no una condición añadida al cierre de #16.
El alcance mínimo aprobado de ese issue debe satisfacer también sus criterios
de accesibilidad, fallback, reduced motion y funcionamiento local preparado.
El historial puede adelantarse mientras se prepara la guía o los modelos.

## Primer PR propuesto

Título: **Preparar la biblioteca y las superficies de CubeOS en Pencil**.

Entrega: [taller de diseño](../delivery/design/README.md), una biblioteca local
compartida, cinco archivos por flujo, escritorio/móvil, inventario de maestros e
instancias y contrato de preparación 3D. Los límites del traslado dinámico viven
en el [inventario](../delivery/design/inventory/ui-current.md).

Es un PR de artefactos y documentación. No cambia React ni contratos de backend;
no cierra #14 por sí solo. No aprueba la UI ni añade modelos o animaciones.
Validación: apertura por CLI, imports relativos, resolución de instancias,
propagación reversible de biblioteca, capturas de las composiciones y enlaces
documentales. Rama de entrega: `design/pencil-foundation`; publicación autorizada
por Edwar. La integración de esta base no equivale a aprobación del rediseño.

Las siguientes iteraciones modifican estos mismos archivos y la biblioteca,
siguiendo el [ciclo de un PR](../delivery/design/README.md#ciclo-de-un-pr-de-ui).
Diseño e implementación pueden compartir PR si están acordados y son revisables;
no se impone un PR de diseño por cada pantalla ni un chat por cada PR.

## Siguiente PR de implementación

Título: **Clarificar la configuración local y la selección del CubeSat**.

Evidencia inicial: el 2026-10-03 se inspeccionó Configuración en navegador.
Una región «Fuente de datos» reúne origen, dispositivo, registro y renombrado;
registrar y renombrar comparten el campo «Nombre visible». No se verificó aún
el flujo completo con escritura ni una composición móvil propuesta.

Propuesta: organizar Fuente → Tu CubeSat → Fotografías, distinguir registro
de renombrado y ofrecer el siguiente destino hacia Visor o Construcción.
Conservar contratos, propiedad, modos de fuente y comportamiento de persistencia.

Archivos de entrada: `apps/web/src/components/settings-view.tsx`, sus clientes
y pruebas existentes; extraer a `packages/ui` solo primitivas que esta pantalla
necesite. No hacer una migración general de componentes.

Criterios de aceptación:

- Evidencia durable del estado actual y propuesta visual acordada antes de programar.
- Registrar, seleccionar, renombrar e importar una fotografía con acciones diferenciadas.
- Razón comprensible de acciones deshabilitadas; carga, error y reintento próximos a la acción.
- Datos DEMO y reales separados; ninguna respuesta tardía contamina otro dispositivo/cuenta.
- Capturas y verificación de escritorio, móvil y teclado.
- Lint, typecheck, tests, build y gates CI aplicables verdes.

## Entrega recomendada de modelos para #16

Recomendación técnica pendiente de inspeccionar los archivos; no es una decisión
irreversible ni requiere un ADR ahora.

- Entregar un **GLB (glTF 2.0)** del conjunto ensamblado, con geometría y texturas
  incluidas, sin recursos remotos. Conservar también el archivo editable original.
- Cada pieza que deba resaltarse o moverse debe ser un objeto/nodo independiente.
  Usar nombres únicos y estables; las piezas repetidas necesitan instancias
  distinguibles. No fusionar todo el CubeSat en una sola malla.
- Conservar posiciones relativas del conjunto, escala física conocida y pivotes
  útiles. La salida glTF usa metros; anotar unidades del original y una dimensión
  de referencia para comprobar la conversión.
- La primera entrega puede carecer de animaciones. Incluir versión/revisión del
  CubeSat, inventario de piezas y procedencia/permiso de uso de los modelos.
- Si se trabaja en Blender, aportar `.blend` además del GLB. Si se trabaja en CAD,
  conservar el proyecto nativo y preferir un intercambio STEP del ensamblaje como
  fuente de conversión, preservando piezas; STEP no se carga directamente en la web.
- Si solo existen STL, aportar uno por pieza más unidades y colocación de ensamblaje.
  No asumir que un STL único conserva la estructura necesaria para enseñar el armado.

Referencias técnicas: [glTF de Khronos](https://www.khronos.org/gltf/) y
[GLTFLoader de Three.js](https://threejs.org/docs/pages/GLTFLoader.html).

Antes del PR6: inspeccionar nombres, escala, materiales, tamaño, nodos y licencias;
definir presupuesto de rendimiento con el modelo real; diseñar la asociación entre
UUID de paso y piezas sin usar el índice de presentación como identidad. El catálogo
actual solo tiene título, instrucciones y orden, por lo que esa asociación no existe
todavía. El progreso sigue usando la API documentada; explorar pasos o reproducir
una animación nunca los completa automáticamente.

## Decisiones pendientes para la siguiente ronda

- Alcance móvil del Visor: tablero desplazable actual o composición adaptada.
- Interacción al explorar pasos no completados y representación de piezas ya montadas.
- Revisión física, inventario y correspondencia paso/pieza tras recibir los modelos.
- Propuesta visual concreta de Configuración; Q1/Q2 no constituyen su aprobación.

Cada hecho conserva su dueño: diseño en DESIGN, términos en CONTEXT, persistencia
y aprobación de guía en construction-progress; este documento coordina entregas.
