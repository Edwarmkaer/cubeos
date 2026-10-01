# UI compartida

Primitivas extraídas sin cambios de presentación: `Badge`, `Button`, `Sheet`,
`FloatingDock`, `GridPattern` e `InteractiveGridPattern`. Conservan las props
originales. El dock usa Next Link y motion; Next y React son peer dependencies.
Los widgets y el estado de telemetría permanecen en `apps/web`.

El paquete exporta fuente TypeScript; Next transpila `@cubeos/ui`. No requiere un
build separado. `pnpm lint` y `pnpm typecheck` verifican también este paquete.

```tsx
import { Button } from "@cubeos/ui";
```

La fuente única de tokens es `src/styles/tokens.css`. El CSS de web lo importa
después de Tailwind y declara `@source` para incluir las clases del paquete.
Los estilos de mapa, cámara y dashboard siguen siendo propiedad de web.
