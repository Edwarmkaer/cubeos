# Progreso — CubeOS

Actualizado: 2026-10-01.

## Arquitectura y siguiente entrega

Frontend pausado para desarrollar backend. Diseño consolidado en [spec](docs/superpowers/specs/2026-10-01-cubeos-backend-design.md), [modelo](docs/domain-model.md) y [plan](docs/superpowers/plans/2026-10-01-cubeos-backend.md). Go/PostgreSQL, perfil local offline y Clerk público, pasos simples por dispositivo, fotos local/S3 e historial persistente. La entrada de telemetría es la ESP32 receptora; imágenes por importación/HTTP y futuro UART acordado con hardware. Railway es destino previsto, no despliegue realizado.

PR 0 en preparación en `chore/project-baseline`: base actual auditada, documentación canónica y referencias preservadas, un único lockfile raíz y CI Linux con `web`/`ci-required`. Remoto autorizado: `https://github.com/Edwarmkaer/cubeos.git`; `main` se inicializó con los dos commits documentales existentes, sin reescribir historia. El PR y sus checks reales se registran al finalizar; el merge requiere revisión independiente del chat raíz. Ramas sin `codex/`, commits con identidad del usuario sin atribución IA. Ningún backend ni recurso cloud se ha creado en esta planificación. Las notas siguientes conservan el estado de frontend de la sesión anterior; el WebSocket/FastAPI previsto allí fue sustituido por ADR 0005.

## Estado actual

Vista previa funcional de Landing, Visor, Equipo, Construcción y Configuración. La dirección Pozo sigue en `draft`: se puede iterar, pero todavía no es baseline aprobado.

El Visor consume un `TelemetrySource` simulado a 2 Hz y comparte última Muestra, historial y Conexión mediante Zustand. Los charts usan una gramática de línea común sin cambiar ninguno de los doce campos. GPS ya usa MapLibre GL JS con OpenFreeMap Dark y queda preparado para coordenadas del backend. En desktop conserva el tablero completo; en pantallas estrechas mantiene sus proporciones y permite desplazamiento horizontal.

## Cómo verlo

```bash
pnpm dev
```

Hover sobre el rail izquierdo en `/visor` para ver la magnificación. En móvil, el botón inferior abre la navegación de estación y el tablero se desplaza horizontalmente.

## Hecho en esta sesión

- Se corrigió la compresión ilegible del tablero en móvil y tablet.
- El shell vuelve a mostrar la Conexión `Simulado` y comparte el estado con el Visor.
- El simulador quedó detrás de `TelemetrySource`; Zustand conserva hasta 60 Muestras.
- GPS reemplazó el croquis por un mapa vectorial con marcador, trayectoria y estados de carga/error/espera.
- Telemetría muestra la Conexión con la estación terrena, frecuencia y última Muestra; ya no duplica temperatura.
- Los títulos del Visor ya no usan iconos; los charts tampoco usan retícula ni marcador final.
- CubeSat y Paneles comparten una región con dos indicadores de batería de igual tamaño, a la espera de definir los voltajes.
- Cámara quedó preparada como galería horizontal con Embla y un estado vacío honesto hasta recibir capturas.
- La atribución del mapa se muestra como texto sin botón de información; el control de seguimiento se ubica arriba a la izquierda.
- Las rutas de producto tienen landmark `main`, título accesible y navegación con `aria-current`.
- `/lab` usa `next/image` para la fotografía remota.

## Siguiente sesión

1. Recapturar Landing, Visor y Equipo en desktop y móvil.
2. Aprobar explícitamente la dirección aplicada y cambiar `DESIGN.md` a `approved`.
3. Conectar `TelemetrySource` por WebSocket en Sprint 2 conservando el mismo contrato.
