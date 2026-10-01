---
name: CubeOS
register: product
status: current
---

# Producto

## Register

product

## Resumen

CubeOS es una plataforma web educativa del grupo CHASQUI-II para ver en tiempo real la telemetría de un CubeSat, recorrer su construcción y elegir la fuente de datos. Corre en el navegador. No opera el satélite.

## Problema

El prototipo en PyQt5 no se comparte en aula ni se abre en un navegador. Los estudiantes necesitan ver orientación, sensores y posición con claridad didáctica, no con una consola de operación profesional.

## Público principal

Estudiantes de ingeniería que construyen u operan el CubeSat, y el grupo CHASQUI-II — UNI que los acompaña. Uso típico: laboratorio o aula, portátil, atención puesta en entender una muestra que llega cada 500 ms.

## Propuesta

Mostrar el estado del CubeSat de forma comprensible: última muestra, historial breve, orientación y posición. El carácter didáctico es objetivo de producto, no adorno.

## Acción principal

- CTA de uso: abrir el Visor y leer la telemetría en vivo (simulada en Sprint 1, real en Sprint 2).
- Resultado esperado: el estudiante identifica orientación, ambiente y posición sin instalar cliente.

## Usuarios y trabajo

En el Visor, el trabajo es leer el último dato y su tendencia. En Construcción, seguir un paso de ensamblaje. En Configuración, saber de dónde vienen los datos y el estado de conexión.

## Personalidad

Clara, técnica y didáctica. Copia en español, concreta, sin slogans. El estado de conexión se dice en voz alta: no se esconde detrás de un icono mudo.

## Principios de diseño

- El dato manda: cada región del Visor enseña una magnitud, no un widget genérico.
- La fuente de datos es un borde: simulador y WebSocket no cambian la UI.
- La composición estática se entiende antes de añadir 3D o motion.
- Consistencia de shell entre las tres superficies: misma cabecera, misma navegación, mismo indicador de conexión.

## Anti-referencias

- Consolas de misión profesionales (Cosmos, Yamcs) como modelo de densidad opaca.
- El prototipo PyQt5 como destino de implementación.
- El trazo sketch de los wireframes como identidad visual.
- SaaS genérico de tarjetas idénticas con icono + título + texto.

## Accesibilidad e inclusión

Objetivo WCAG AA en contraste, foco visible y semántica. Respetar `prefers-reduced-motion`. El visor 3D no puede ser el único canal de la orientación: los valores numéricos permanecen en HTML.

## Superficies

Las rutas de la app (Visor, Construcción, Configuración) son el producto. Landing y Equipo son la cara pública del grupo. El Sprint 1 de la app implementa el Visor con datos simulados; Construcción y Configuración después. Landing se especifica ahora y se construye en estático **antes** de su motion.

Evidencia de IA: [references/ui/](references/ui/). Identidad: [DESIGN.md](DESIGN.md) (`draft`).

### Landing

Cara pública de CubeOS. Grilla tipo Dovetail sobre navy. CTA: entrar al Visor. No opera telemetría. Referencia de piel: [references/ui/dovetail-hero-live.png](references/ui/dovetail-hero-live.png).

### Equipo

Apartado (landing o blog) de las personas de CHASQUI-II. Composición tipo Tempo: texto + objeto en movimiento. El motion entra después de aprobar la versión estática. Referencia: [references/ui/tempo-hero.png](references/ui/tempo-hero.png).

### Visor

Pantalla principal de telemetría. Shell: cabecera (marca CubeOS, título, estado de conexión) y barra lateral con tres destinos (Visor, Construcción, Configuración).

Regiones previstas, según wireframe de tablero y spec previa:

| Región | Trabajo | Datos de contrato confirmado |
| --- | --- | --- |
| Visor 3D | Mostrar orientación del CubeSat 1U | `gyro_roll`, `gyro_pitch`, `gyro_yaw` |
| Tarjetas de sensores | Última muestra, con estado normal/alerta/crítico | temperatura, UV, humedad, altitud, orientación, aceleración |
| Gráficas | Tendencia de ~30 s (60 muestras) | temperatura, orientación, aceleración |
| Mapa GPS | Posición y trayectoria reciente | `gps_lat`, `gps_lon`, `gps_alt` |

El visor se detalla en expansiones (no son rutas nuevas): CubeSat, GPS, movimiento y orientación, sensores ambientales, sensores climáticos y cámara. Ver [references/ui/ExpansionCubesat.png](references/ui/ExpansionCubesat.png) y vecinos.

En móvil, las secciones 3D, sensores y mapa pasan a pestañas.

**Conflicto de contrato:** el wireframe del tablero también muestra luz, presión, baterías (CubeSat y paneles) y cámara. Esos widgets no están en los doce campos confirmados. No se implementan hasta resolver D-001 y D-005 en [docs/open-questions.md](docs/open-questions.md).

### Construcción

Guía de ensamblaje del CubeSat. Mismo shell. Contenido: visor del armazón, paso actual (el wireframe usa el ejemplo 15/60), lista de piezas del paso y barra de progreso entre pasos. No envía comandos al hardware. Evidencia: [references/ui/ConstruccionPrincipal.png](references/ui/ConstruccionPrincipal.png).

El catálogo de pasos, piezas y criterios de “paso completado” aún no está escrito (D-005). Esta superficie existe como producto; no se inventa el contenido educativo al implementar.

### Configuración

Mismo shell. Destino para fuente de datos, estado de conexión y ajustes de la estación. El wireframe [references/ui/SettingsPrincipal.png](references/ui/SettingsPrincipal.png) solo fija el marco; los controles concretos se definen con D-006 (protocolo WebSocket) y no se rellenan por comodidad.

## Alcance de la primera versión

### Incluye (documentado)

- Las tres superficies de la app y el shell compartido.
- Landing y Equipo como cara pública (estático primero).
- Contrato de doce campos a 2 Hz, con simulador en Sprint 1.
- Independencia de la fuente de datos.

### Incluye (implementación, cuando se abra código)

- Sprint 1: Visor con simulador, composición estática primero, 3D después.
- Sprint 2: FastAPI + WebSocket + SQLite, mismo contrato.

### No incluye todavía

- Comandar o controlar el CubeSat.
- Sustituir software profesional de operación.
- Cliente de escritorio. PyQt5 es antecedente, no destino.
- `apps/api` en el Sprint 1.
- Luz, presión, baterías y cámara como requisitos, hasta cerrar D-001 / D-005.
- Identidad visual: `DESIGN.md` en `draft` hasta aprobar navy, split de superficies y logo.

## Resultado esperado por etapa

| Etapa | Fuente | Objetivo |
| --- | --- | --- |
| Sprint 1 | Simulador en el frontend | Validar Visor, visualizaciones y flujo educativo |
| Sprint 2 | Serial/radio → FastAPI → WebSocket | Telemetría real e historial persistido |

## Criterio de éxito

Un estudiante abre el Visor en el navegador, entiende si hay conexión, lee orientación, ambiente y posición, y distingue una muestra viva de un fallo de sensor. La Construcción se puede seguir como secuencia de pasos cuando su contenido exista. La Configuración explica la fuente de datos sin jerga de infraestructura.

## Antecedente

El prototipo PyQt5 aporta el esquema inicial de SQLite, la lógica de roll/pitch/yaw y la simulación con GPS. El stack web actual está en [docs/adr/0004-nextjs-app-router.md](docs/adr/0004-nextjs-app-router.md).
