# Inventario de traslado — UI actual

Fecha: 2026-10-03. Base: `79d9c59`. Estado: base de diseño editable; ninguna
pantalla trasladada equivale a aprobación visual. Los seis archivos se editaron
con herramientas de Pencil a través del CLI oficial, sin modificar su cifrado.

## Pantallas disponibles

Los IDs son estables dentro de cada documento. Capturas: exportaciones del canvas
en [references/pencil](../references/pencil/), no screenshots del navegador.

| Archivo | Estado | Desktop 1440×900 | Móvil 390×844 |
| --- | --- | --- | --- |
| [landingpage.pen](../pencil/landingpage.pen) | Hero y navegación; Galaxy excluido del traslado | [d3STF](../references/pencil/d3STF.png) | [A9aGRc](../references/pencil/A9aGRc.png) |
| [equipo.pen](../pencil/equipo.pen) | Cuatro plazas por confirmar y lámpara radial | [c8UVWU](../references/pencil/c8UVWU.png) | [pSeZc](../references/pencil/pSeZc.png) |
| [configuracion.pen](../pencil/configuracion.pen) | Local sin URL/API ni dispositivo; offline seleccionado | [W9krOZ](../references/pencil/W9krOZ.png) | [FERuh](../references/pencil/FERuh.png) |
| [visor.pen](../pencil/visor.pen) | Local pendiente, sin muestra ni dispositivo | [mal7a](../references/pencil/mal7a.png) | [NFE7b](../references/pencil/NFE7b.png) |
| [construccion.pen](../pencil/construccion.pen) | Sin dispositivo ni pasos publicados; esquema SVG actual | [lvs6R](../references/pencil/lvs6R.png) | [o47awj](../references/pencil/o47awj.png) |

Adicionales: Configuración en DEMO, frame [oUm3M](../references/pencil/oUm3M.png).
Visor DEMO: [VDZEo](../references/pencil/VDZEo.png) y
[VfRHb](../references/pencil/VfRHb.png), bajo `90 / Reference`: referencias
parciales con valores sintéticos observados, gráficas vectoriales y fotos de
ejemplo. No son capturas simultáneas ni mediciones del CubeSat.

Cada superficie tiene un brief en el canvas. No se crearon frames de propuesta
o aceptación vacíos. `/lab` permanece fuera del taller del producto.

## Biblioteca y código

[cubeos-components.lib.pen](../pencil/cubeos-components.lib.pen) contiene ocho
maestros, variables y ejemplos de controles disponibles/deshabilitados.
[component-map.json](../pencil/component-map.json) es dueño de IDs, alias,
correspondencia con código y consumidores. La biblioteca acumula cambios de PRs;
los archivos por flujo mantienen su composición y contenido específico.

- Tokens: `packages/ui/src/styles/tokens.css`; variables Pencil como espejo.
- Cabecera: `apps/web/src/components/site-header.tsx`, 64px.
- Dock: `packages/ui/src/components/floating-dock.tsx` y `station-dock.tsx`.
- Tile: `apps/web/src/components/visor/tile.tsx`; título y slot de contenido local.
- Formulario: `apps/web/src/components/settings-view.tsx`; los maestros extraídos
  representan sus controles actuales, no el Button genérico de `packages/ui`.
- Landing/Equipo: páginas y componentes `landing-hero.tsx` / `landing-atmosphere.tsx`.
- Visor: `real-dashboard.tsx` y `dashboard-grid.tsx`; Construcción: `construction-view.tsx`.

Los consumidores usan imports e instancias reales de cabeceras, navegación y
Tile. Configuración además usa campos/acciones; Landing usa el enlace de acción.
Los slots permiten editar contenido específico sin duplicar el maestro Tile.

## Verificación realizada

Resumen estructural reproducible: [verification.json](verification.json).

- Cinco superficies observadas e importadas desde Next local, en ambos viewports;
  correcciones explícitas de controles nativos, alineaciones y grid importado.
- Guardado y reapertura de las cinco superficies; biblioteca con estado `ok`.
- Antes de publicar se detectó que Configuración había sido sustituida por el
  antiguo canvas de importación. Se preservó esa copia fuera de la entrega y se
  reconstruyó por CLI desde la extracción registrada. Las tres exportaciones
  recuperadas coinciden píxel a píxel con las anteriores; mapa e IDs actualizados.
- Cambio temporal de wordmark en los dos maestros: `CubeOS · TEST` apareció en
  las 13 cabeceras consumidoras; restauración comprobada a `CubeOS`.
- Copia de Landing y biblioteca a otra carpeta: el import resolvió la biblioteca
  de esa carpeta, confirmando relación relativa, no dependencia del checkout original.
- Inspección visual y exportación de las composiciones. Los renders sin texto por
  fallo de descarga de fuentes se descartaron y se repitieron al reabrir.
  El fallo de red de Node se resolvió para las sesiones de comprobación mediante
  `NODE_USE_ENV_PROXY=1`, usando el proxy ya configurado en el entorno.

## Límites de fidelidad y cobertura

- Pencil no importó Galaxy WebGL. Se conserva una región transparente identificada
  en Landing; su aspecto y movimiento se comprueban en el navegador. No se añadió
  una galaxia inventada ni una captura de toda la página como sustituto de la UI.
- En DEMO, mapa WebGL y cubo CSS con transformaciones 3D no se transfirieron
  fielmente. El cubo lleva una anotación explícita; son referencias parciales.
- El bento móvil mantiene 1152px y queda recortado al viewport inicial. Sus capas
  completas siguen dentro del frame; el `.pen` no simula scroll. Baterías y algunas
  regiones de datos también contienen overflow del producto actual; el render
  estático no reproduce barras nativas ni demuestra accesibilidad.
- Las fotografías DEMO enlazan los originales del repositorio. Créditos y permiso
  de uso: [procedencia](../../../apps/web/public/demo/camera/README.md).
- Los estados con API/dispositivo, fotos reales, errores, autenticación pública,
  reconexión, focus/hover y navegación expandida requieren sus fixtures y revisión
  del próximo slice. No se crearon datos privados ni se probaron escrituras.
- Las fuentes dependen del renderizador/caché de Pencil. Abrir sin red no se ha
  certificado. Revalidar tipografía al editar en otra máquina.
- Guía y modelos físicos pendientes: Edwar valida el paso a paso. La preparación
  de GLB/escenas vive en [3d/README](../3d/README.md).

Esta cobertura permite editar las cinco superficies y sus componentes compartidos.
La equivalencia funcional, el rediseño y su aprobación pertenecen a los siguientes PRs.
