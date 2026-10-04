# Biblioteca y superficies en pen.dev

Estado: base editable extraída de `79d9c59`. Existen los seis archivos; el
[inventario](../inventory/ui-current.md) registra pantallas, IDs, capturas y límites.
No es una aprobación visual ni una reproducción ejecutable de la aplicación.

| Archivo | Responsabilidad |
| --- | --- |
| `cubeos-components.lib.pen` | Variables espejo, primitivas y patrones compartidos |
| `landingpage.pen` | Home pública y sus versiones responsive |
| `visor.pen` | Tablero, fuente local, DEMO y estados de datos |
| `construccion.pen` | Guía, avance, instrucciones y futura región de escena |
| `configuracion.pen` | Fuente, dispositivo, identidad e importación de fotografías |
| `equipo.pen` | Presentación del grupo y plazas pendientes |

## Biblioteca acumulativa

Los archivos de superficie importan la biblioteca local e instancian sus maestros.
No duplicar maestros por PR ni copiar pantallas enteras a la biblioteca. Acumular
componentes útiles, con nombre estable y correspondencia con el código; el historial
de Git conserva versiones anteriores. Los alias de importación son propios de cada
documento: nunca copiar un alias suponiendo que identifica la misma biblioteca.

Maestros extraídos: cabeceras desktop/móvil, dock desktop/toggle móvil, campo de
formulario, acción de formulario, enlace de acción y pozo de contenido (`Tile`).
Las pantallas consumen instancias reales; `Tile` usa un slot con contenido local.
La correspondencia con el código está en [component-map.json](component-map.json).
Las tarjetas de sensores, catálogo de pasos y composiciones de cada página tienen
dueño en su flujo hasta que exista reutilización real que justifique extraerlas.
Los maestros de presentación no incorporan lógica de autenticación ni telemetría.

`packages/ui/src/styles/tokens.css` sigue siendo el dueño de los tokens de código.
Las variables Pencil son su espejo. Tipografía y geometría adicionales se toman
de los componentes actuales y se registran como valores observados. Un cambio en
Pencil no modifica React automáticamente: debe tener un PR de implementación.

## Organización del canvas

- Biblioteca: `00 / Foundations`, `10 / Components`, `20 / State specimens`.
- Superficies: `00 / Brief`, `10 / Local components`, `20 / Current`,
  `30 / Proposal`, `40 / Accepted` y `90 / Reference`, según contenido real.
- Cada pantalla es un frame raíz con clipping y nombre
  `<Surface> / <State> / <Viewport>`. No crear secciones vacías como entregables.
- `Current` reproduce lo observado; `Proposal` no está aprobado; `Accepted`
  requiere evidencia explícita y no se asigna por terminar una extracción.
- Conserva los IDs de pantallas y maestros existentes. Una propuesta nueva puede
  duplicar un frame `20 / Current` y recibir IDs nuevos; después se itera sobre
  esa propuesta sin recrearla en cada PR.

## Edición y verificación

Un editor por archivo; la biblioteca se edita de forma serializada. Usar el MCP
de Pencil o el CLI oficial `pen interactive`; nunca leer, editar ni mezclar como
texto el contenido cifrado de un `.pen`. Confirmar el documento activo antes de
escribir. En el puente desktop usado durante esta extracción se debe proporcionar
`filePath` a cada herramienta; sin él se operaría sobre la pestaña activa, que
puede pertenecer a otro proyecto. El CLI headless lo inyecta desde `--in/--out`.

1. Inspeccionar contenido y referencias antes de editar.
2. Mantener `placeholder: true` en el frame en trabajo; retirarlo al terminarlo.
3. Verificar composición, tipografía, tamaños, clipping y recursos visualmente.
4. Guardar por Pencil y reabrir desde su ubicación canónica.
5. Comprobar imports relativos, variables e instancias con sus overrides.
6. Tras un cambio compartido, revisar todos los consumidores. No asumir hot reload
   entre sesiones independientes del CLI; reabrir es la comprobación requerida.
7. Registrar IDs, capturas y límites de fidelidad en el inventario.

Si una pestaña desktop conserva un buffer anterior a un guardado externo, no
guardarla sobre el archivo nuevo. Revisar/reabrir desde disco. No cerrar buffers
con cambios del usuario de forma automática.

Las capturas de efectos WebGL, mapas o fotografías son referencias identificadas;
no equivalen a componentes editables ni certifican animación, datos o interacción.
Las capas de UI deben seguir siendo editables. No sustituir una página completa
por una imagen para declarar terminado su traslado.

## Comenzar un slice

La primera edición será en [configuracion.pen](configuracion.pen). Reabrir el
archivo guardado en disco antes de empezar. Duplicar las pantallas actuales local
desktop `W9krOZ` y móvil `FERuh` en el mismo documento y nombrar las copias
`30 / Proposal / Configuración / Local / 1440x900` y
`30 / Proposal / Configuración / Local / 390x844`. Conservar los originales como
referencia y registrar los IDs nuevos en el slice. La propuesta debe distinguir
fuente de datos, CubeSat y fotografías; los estados conectados necesitan evidencia
adicional, porque esta base solo capturó local sin dispositivo y DEMO.

Editar la composición y los overrides propios de Configuración en ese documento.
Si un cambio debe alcanzar todas las pantallas, editar su maestro en
[cubeos-components.lib.pen](cubeos-components.lib.pen) y revisar los consumidores
del mapa. No desvincular instancias para resolver un cambio compartido. Los cambios
de biblioteca también afectan a los frames `Current`: las capturas exportadas y
el commit de esta base conservan la referencia anterior.

Usar [slice-template.md](slice-template.md) para registrar alcance, frames y
consumidores afectados. El primer slice entregado es
[base Pencil](../slices/01-pencil-foundation.md). Mantener estos archivos por flujo;
no crear una nueva biblioteca para cada PR.

```bash
pen interactive --in delivery/design/pencil/configuracion.pen --out delivery/design/pencil/configuracion.pen
```

Dentro del CLI: `list_libraries()`, `get_app_state()`, `execute(...)`, `save()` y
`exit()`. Consultar `read_skill()` y `read_skill({path:"execute.md"})` al comenzar.
El CLI utilizado fue 0.3.10. No hace falta contratar otro modelo para ejecutar
estas herramientas directamente. El renderizador de fuentes puede necesitar red
o caché de Pencil; si la descarga falla y desaparece texto, reabrir en una sesión
serial y verificar de nuevo, sin aprobar ni exportar ese render incompleto.
En esta máquina Node no usaba el proxy del entorno para `fetch`; se comprobó
timeout directo y HTTP 200 con `NODE_USE_ENV_PROXY=1`. Ante ese síntoma, ejecutar
`NODE_USE_ENV_PROXY=1 pen interactive ...` para ese proceso. No se modificó la
configuración global ni se sustituyeron fuentes del producto.
