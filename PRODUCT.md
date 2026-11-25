---
name: CubeOS
register: product
status: current
---

# Producto

## Resumen

CubeOS es una estación de tierra que corre en el navegador. Conectas una placa
(ESP32, Arduino…) por USB, defines cómo leer sus datos y ves su telemetría en
vivo. Además, cargas tu modelo 3D y sigues su armado paso a paso.

Proyecto personal de portafolio (hardware + web). Debe funcionar sin hardware:
la DEMO sintética está siempre disponible.

## Público

- Quien revisa el portafolio: entiende el proyecto en segundos con la DEMO.
- Makers y estudiantes con una placa propia: la usan como herramienta real.

## Superficies

| Ruta | Trabajo |
| --- | --- |
| `/` Landing | Presentar el proyecto y llevar a la DEMO o a conectar una placa. |
| `/visor` Visor | Leer la telemetría en vivo: último valor, tendencia, orientación, mapa. |
| `/construccion` Armado | Seguir el armado de un modelo 3D paso a paso. |
| `/conectar` Conectar | Elegir fuente, puerto, formato y perfil de campos. |

## Principios

- Simple, efectiva y al grano: cada pantalla tiene un solo trabajo.
- El dato manda: cada widget muestra una magnitud con su unidad.
- El estado de la fuente se dice en texto (DEMO, conectado, sin datos).
- Lo del usuario (perfiles, modelos, guías) vive en su navegador y se exporta.
- Sin backend, sin cuentas.

## Fuera de alcance

- Enviar comandos al hardware.
- Cuentas, sincronización en la nube o colaboración.
- Formatos de modelo distintos de GLB/glTF.

## Accesibilidad

WCAG AA, foco visible, `prefers-reduced-motion`. El 3D nunca es el único canal:
los valores también están en HTML.

Roadmap: [docs/roadmap.md](docs/roadmap.md). Decisión de arquitectura:
[ADR 0007](docs/adr/0007-web-only.md).
