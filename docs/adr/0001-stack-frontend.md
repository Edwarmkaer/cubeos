# Stack frontend

Se necesita una interfaz web para telemetría en tiempo real, con visor 3D, gráficas, mapa GPS, 2 Hz y acceso desde navegador. El prototipo PyQt5 no cumple portabilidad ni uso en aula.

**Decisión:** React 18 + Vite en `apps/web`, con Zustand, Tailwind CSS y Lucide React. Three.js + `@react-three/fiber` + `@react-three/drei`, Recharts y React-Leaflet entran **después** de aprobar la composición estática del Visor (`agent-kit/web/WORKFLOW.md`).

**Status:** superseded by [0004-nextjs-app-router.md](0004-nextjs-app-router.md)

La elección de React, Zustand, Tailwind, Lucide y el gate de 3D se mantienen. El bundler pasa de Vite a Next.js.

## Considered Options

- Mantener PyQt5: no es web ni sirve al uso educativo en navegador.
- Vue 3 + Nuxt: viable, con menos ecosistema 3D y material de aprendizaje para este caso.

## Consequences

Acceso desde navegador y soporte GLTF/OBJ. Coste: curva para quienes vienen de Python y un bundle mayor. El primer slice no instala WebGL; el 3D es un cambio posterior con fallback y `prefers-reduced-motion`.
