# Taller de diseño de CubeOS

Este directorio organiza el trabajo visual del milestone
[Frontend local completo](https://github.com/Edwarmkaer/cubeos/milestone/1).
El contrato visual sigue siendo [DESIGN.md](../../DESIGN.md), en `draft`.
No existe un segundo contrato de diseño en este directorio.

## Acuerdo de trabajo — 2026-10-03

Edwar autorizó trasladar la UI actual a pen.dev, con una biblioteca compartida
acumulativa y archivos por superficie. Es una extracción del estado existente;
no aprueba un rediseño ni la implementación del simulador 3D.

El trabajo continúa en este chat. Abrir otro chat solo cuando la mezcla de
alcances lo justifique y Edwar lo solicite; un PR no exige un chat nuevo.
La separación de PRs responde a cambios revisables, no al número de archivos
Pencil. Diseño e implementación se separan cuando necesitan revisiones distintas.

## Fuentes y responsabilidades

| Material | Dueño |
| --- | --- |
| Alcance de producto | [PRODUCT](../../PRODUCT.md) |
| Identidad y aprobación visual | [DESIGN](../../DESIGN.md) |
| Tokens implementados | [tokens.css](../../packages/ui/src/styles/tokens.css) |
| Primitivas implementadas | [packages/ui](../../packages/ui/README.md) |
| Maestros y consumidores de diseño | [pencil/README](pencil/README.md) |
| Inventario del traslado | [inventory/ui-current](inventory/ui-current.md) |
| Preparación de escenas 3D | [3d/README](3d/README.md) |
| Orden de entregas del milestone | [hoja de ruta](../../docs/frontend-local-roadmap.md) |

Las capturas de `references/` son exportaciones del canvas basado en el producto
observado, no capturas del navegador ni aprobaciones.
`baselines/` solo contendrá capturas aprobadas explícitamente. Los archivos por
flujo conservan juntos escritorio, móvil y sus estados. `/lab` sigue siendo un
archivo de exploración; no se promueve a biblioteca del producto.

## Secuencia de esta extracción

1. Observar las cinco superficies actuales en 1440×900 y 390×844 CSS px.
2. Trasladar composición, contenido y estados observados a capas editables.
3. Extraer maestros comunes a `cubeos-components.lib.pen`; enlazar consumidores.
4. Comprobar variables, instancias, overrides y recursos desde la carpeta final.
5. Guardar, reabrir y verificar propagación de un cambio reversible de biblioteca.
6. Entregar el inventario real de IDs y límites, listo para la iteración visual.

Revisar cada superficie renderizada. El bento móvil actual se documenta con su
desplazamiento horizontal; cambiarlo requiere una propuesta posterior. No se
inventan valores reales, pasos educativos ni modelos físicos para llenar estados.

## Ciclo de un PR de UI

Captura actual → propuesta en el `.pen` existente → aprobación visual del alcance
→ implementación → revisión en navegador y verificaciones → entrega del PR.
Actualizar la biblioteca cuando el cambio sea compartido; conservar composiciones
específicas en el archivo del flujo. Registrar todos los consumidores afectados.
El CI del último commit y la revisión técnica no sustituyen la aceptación visual.
Merge, publicación y despliegue siguen el alcance autorizado para esa entrega.
