---
name: CubeOS
status: draft
reference:
  dominant: references/ui/lab-pozo.png
  source: exploración /lab (dirección Pozo)
  fidelity: medium
colors:
  background: "#16161E"
  surface: "#1C1C26"
  well: "#0A0A10"
  foreground: "#E8E8F0"
  muted: "#9C9CAA"
  border: "transparent"
  primary: "#E8E8F0"
  accent: "#D1184A"
typography:
  display:
    fontFamily: "Big Shoulders, ui-sans-serif, sans-serif"
    fontSize: "5.25rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "8px"
  surface: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "40px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    height: "40px"
---

# Dirección de diseño

`status: draft`. Dirección **Pozo** elegida en `/lab` (2026-09-02). Falta aprobar el producto aplicado (`/`, `/visor`, `/equipo`).

Hay **dos superficies**. No se mezclan.

| Superficie | Registro | Referencia dominante | Evidencia |
| --- | --- | --- | --- |
| Visor, Construcción, Configuración | product | Pozo: pozos más oscuros que el fondo | `references/ui/lab-pozo.png` |
| Landing y Equipo | brand | Pozo + Galaxy tenue en Landing; lámpara radial en Equipo. Sin grilla | `references/ui/lab-pozo.png` |

Dovetail (grilla) y Tempo (órbita) quedan como archivo histórico en `references/ui/`. Ya no mandan la piel.

## Tesis visual

Estación en tinta. El fondo `#16161E` es un peldaño más claro que el contenido `#0A0A10`. Las regiones se cavan; no se recuadran. El rojo del logo no es CTA: vive en el isotipo y, más adelante, en crítico.

## Escena de uso

Laboratorio o aula, portátil, luz de clase. Fondo oscuro para que el dato reciba la atención. La Landing usa un campo estelar tenue y monocromo; Equipo conserva la lámpara radial.

## Referencia dominante

### Pozo — identidad y shell

- Evidencia: `references/ui/lab-pozo.png`, exploración `/lab?d=pozo`
- Extraído: fondo `#16161E`; pozo `#0A0A10`; tinta `#E8E8F0`; CTA texto + flecha; nav activa por relleno, no por borde; sin grilla.

### Se conserva

- Headline grande, subtítulo estrecho, dos acciones (primaria textual, secundaria muted).
- Aire en Landing; nav liviana.
- Wireframes: shell del Visor (cabecera, nav lateral, Conexión, regiones).

### Se descarta de la preview anterior

- Navy del logo `#151549` como fondo de página (se leía violeta claro).
- Grilla Magic UI (interactiva o estática).
- Rojo `#D1184A` como botón, badge o anillo.
- Cajas con hairline blanca.

### Decisiones inferidas

- El navy del logo sigue en el PNG; no tiñe la UI.
- Un pozo es `bg-well` + radio 8px. Cero `border`.
- Big Shoulders para titulación; Barlow para leer. No se usa la wordmark del PNG como fuente.

## Composición

### Landing / Equipo

- Una columna de tipo. Landing: Galaxy de React Bits detrás del hero y del navbar; Equipo conserva lámpara radial.
- CTA primario: texto + flecha. Secundario: muted, sin borde.
- Equipo: un pozo por plaza, no lista con reglas ni bento.

### Visor

- Mismo shell que Construcción y Configuración: navbar pública + Sheet de estación.
- Distribución de `references/ui/DashboardPrincipal.png`: tablero bento a viewport, no tres paneles iguales.
  - Izquierda (~38%): Luz | Luz UV (fila corta); Giro y orientación; GPS (canvas, el más alto de esa columna).
  - Centro (estrecha, ~11rem): Presión, Temp, Humedad en tercios iguales.
  - Derecha (~46%): Visor 3D (canvas dominante, ~mitad de altura); Telemetría | CubeSat/Paneles; Cámara (franja).
- Luz, presión, baterías y cámara se reservan en el layout; no se inventan valores (D-001, D-005).
- Expansiones (GPS, cubo, sensores) siguen siendo detalle, no rutas.
- Giro: valores/leyenda arriba y un único chart de líneas debajo. DEMO conserva Roll cian apagado, Pitch violeta y Yaw ámbar; v2 etiqueta X/Y/Z °/s con los mismos colores y trazos. Cada tendencia se normaliza de forma independiente; la lectura numérica conserva su unidad. Aceleración v2 X/Y/Z se lee debajo. No sustituir por medidores radiales ni derivar actitud del giroscopio.
- UV, temperatura y humedad: valor actual + unidad + tendencia de línea. Los títulos de los pozos no llevan iconos. Comparten grosor con Giro y orientación; los charts no llevan retícula ni marcador final porque el valor actual ya está escrito. No mostrar estado normal/alerta/crítico hasta cerrar D-004.
- GPS: mapa vectorial plano MapLibre GL JS con OpenFreeMap Dark, marcador actual, trayectoria reciente y coordenadas textuales. Debe poder quedar esperando coordenadas y mostrar fallos del mapa base sin inventar una posición.
- Telemetría: DEMO conserva frecuencia, última Muestra e historial sintético. En v2 muestra conexión API, dispositivo, entrega observada del receptor y metadatos disponibles; radio permanece desconocido sin evidencia. El enlace Configurar fuente queda junto al estado; contenido adicional se desplaza dentro del pozo cuando necesita espacio. No replica la tendencia de otro sensor.
- CubeSat y Paneles: dos pozos de batería con dimensiones idénticas colocados lado a lado. Aro de 80px con apertura visible, adaptado a Pozo. En v2 voltaje V es texto; aro vacío hasta calibrar SOC (D-007). Paneles no tiene medición independiente. DEMO conserva sus indicadores sintéticos, etiquetados.
- Cámara: banda horizontal inspirada en React Bits Circular Gallery, con arco mínimo, foco central, scroll/arrastre y teclado. Se implementa con scroll DOM accesible, no con un segundo canvas WebGL. Hasta tres capturas se distribuyen sin scroll; con más capturas se activa el desplazamiento. No muestra scrollbar, instrucciones ni texto sobre las imágenes; nunca hay autoplay.

### Construcción

- `references/ui/ConstruccionPrincipal.png`: paso + lista | canvas del armazón | vista; barra de progreso abajo.
- Sin catálogo inventado (D-005).

### Configuración

- `references/ui/SettingsPrincipal.png`: mismo shell y pozo de fuente de datos. PR7 integra controles nativos con tokens existentes: origen explícito, URL, modo sin Internet, consulta/selección de dispositivo, registro y renombrado. Estados de carga/error se leen junto a los controles. Este cambio funcional no aprueba una nueva dirección visual.

## Tipografía

- Display (Landing y wordmark): **Big Shoulders** 600, `clamp(3rem, 7vw, 5.25rem)`, tracking -0.02em, `text-wrap: balance`. Techo 5.25rem.
- UI y cuerpo: **Barlow** 400/500/600. Cuerpo 1.125rem / 1.75. Muted `#9C9CAA`.
- Producto (Visor): títulos de región en Barlow 1rem/500. Lecturas en Geist Mono ≥ 1.125rem.
- Wordmark CubeOS: Display 1.5rem (2xl) en la barra. El PNG del logo no entra en el nav; se coloca al final.
- No Inter, Geist Sans, IBM Plex ni pixel font.

## Color y profundidad

- Estrategia: **restrained**. El fondo es tinta; el acento saturado (rojo logo) ≤5% y no es botón.
- Profundidad por pozo: el contenido es más oscuro que la página. Sin hairline, sin sombra amplia, sin glass.
- Rojo `#D1184A` solo en el isotipo y, más adelante, en estado crítico. Un solo rojo.

## Geometría

- Controles y pozos: 8px. Nunca 24px+ en paneles.
- Iconos: Lucide, 16–20px.

## Componentes fundamentales

### Botones

- Primary (Landing): texto + flecha, sin relleno ni borde.
- Secondary: muted, hover a foreground.
- Focus visible. Candidato: Shadcn para controles de formulario más adelante.

### Navegación

- Top nav estándar: 64px, logo a la izquierda, enlaces centrados en el viewport y estado a la derecha. Sin subtítulo bajo el wordmark.
- Estación: `FloatingDock` proporcionado, adaptado al eje vertical y reservado a la izquierda. Sin borde exterior; ítems cuadrados redondeados, magnificación y etiquetas laterales; `prefers-reduced-motion` apaga el scale.

### Superficies

- Landing: sin cards; Galaxy monocromo y tenue (`glow 0.2`, `twinkle 0.2`, `speed 0.9`) con repulsión al puntero. Equipo: un pozo por persona.
- Visor: pozo si agrupa una magnitud.

## Responsive

- Desktop Landing: una columna. Visor: tablero de cajas como `DashboardPrincipal.png`, ajustado completo a `100dvh` sin scroll.
- Construcción: paso | canvas | vista. Configuración: un canvas.
- Mobile Visor: el tablero hace scroll horizontal para no romper la distribución.

## Motion

- Landing: una entrada (kicker → título → cuerpo → CTA), 600 ms, ease-out. Flecha del CTA se desplaza en hover.
- Equipo: el mismo reveal; la lista entra en stagger corto (≤200 ms total).
- Visor: sin coreografía de entrada. 150–250 ms solo en estado.
- `prefers-reduced-motion`: estado final, sin desplazamiento.

## Assets

- Logo: `references/ui/chasqui-ii-logo.png`. No va en el navbar; entra al final, a tamaño real.
- Wordmark: la palabra CubeOS en Big Shoulders.
- Exploración: `references/ui/lab-*.png`. Histórico: Dovetail, Tempo, wireframes.
- Modelo 3D: más adelante, gate estático.

## Antipatrones

- No grilla (Magic UI Interactive/Grid/Retro, dots, milimetrado).
- No navy `#151549` como fondo de página.
- No rojo como CTA, badge o anillo.
- No recuadros con borde blanco para delimitar.
- No glass, glow, gradient text, hero-metric.
- No instalar Three.js para “ver cómo queda”.

## Candidatos de implementación

| Pieza | Candidato | Adaptación |
| --- | --- | --- |
| Atmósfera Landing | React Bits Galaxy TS + Tailwind | `ogl`; monocromo; reduced motion congela el canvas. |
| Pozo | `bg-well` | Radio 8px. Sin `border`. |
| Nav pública | Barra propia | 64px; logo + links a la izquierda. |
| Estación | `FloatingDock` + Tabler | Vertical a la izquierda; sin marco; ítems cuadrados; Motion; variante móvil desplegable. |
| Charts de telemetría | SVG compartido `TrendChart` | Curva suavizada de línea, sin retícula ni marcador final. Giro superpone las tres series sin cambiar sus datos. Evita el costo de Recharts a 2 Hz. |
| Mapa GPS | MapLibre GL JS + OpenFreeMap Dark | Mapa vectorial sin token, trayectoria GeoJSON y marcador actual. `NEXT_PUBLIC_MAP_STYLE_URL` permite sustituir el proveedor sin cambiar el componente. |
| Baterías | Magic UI Animated Circular Progress Bar | Tamaño compacto, aro vacío sin voltaje y porcentaje solo tras resolver D-007. |
| Galería de cámara | React Bits Circular Gallery | Curvatura reducida y scroll DOM accesible para no añadir otro canvas WebGL al tablero. |
| Form controls (luego) | Shadcn | Tokens Pozo; primary ya no es rojo. |
| Grilla / órbita / Globe | Descartados en Pozo | Quedan en `/lab` como archivo. |

## Baselines

Pendientes de aprobación del producto aplicado:

- Exploración Pozo: `references/ui/lab-pozo.png`
- Desktop Landing / Visor / Equipo: a recapturar tras este slice

## Gate de aprobación

- [x] Dirección Pozo elegida en `/lab`.
- [x] Logo CHASQUI-II en `references/ui/chasqui-ii-logo.png`.
- [x] MapLibre GL JS + OpenFreeMap Dark aprobados para GPS (2026-09-06).
- [x] Telemetría definida como estado de conexión con estación terrena (2026-09-06).
- [ ] El usuario aprobó el producto aplicado (fondo tinta, pozos, CTA textual).
- [ ] `status` pasa a `approved`.
