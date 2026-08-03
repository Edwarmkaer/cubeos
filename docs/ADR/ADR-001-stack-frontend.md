# ADR-001 — Stack frontend

- Estado: aceptada
- Fecha: 2026-05
- Autores: CHASQUI-II — UNI

## Contexto

Se requiere una interfaz web para visualizar telemetría en tiempo real, con visualización 3D, gráficas, mapa GPS, actualización cada 500 ms y acceso desde navegador. El prototipo anterior en PyQt5 limita la portabilidad y el acceso educativo.

## Decisión

Adoptar **React 18 + Vite** para el frontend, con las siguientes bibliotecas:

| Función | Decisión |
| --- | --- |
| Visualización 3D | Three.js + `@react-three/fiber` + `@react-three/drei` |
| Gráficas | Recharts |
| Mapa GPS | React-Leaflet |
| Estado global | Zustand |
| Estilos | Tailwind CSS |
| Iconos | Lucide React |

## Alternativas descartadas

- Mantener PyQt5: no cumple el requisito de acceso web ni facilita la visualización educativa en navegador.
- Vue 3 + Nuxt: viable, pero con un ecosistema 3D y material de aprendizaje menor para este caso.

## Consecuencias

Positivas: acceso desde navegador, soporte para modelos GLTF/OBJ, ecosistema amplio y herramientas de depuración para el estado de sensores.

Costes: curva de aprendizaje para miembros con experiencia principalmente en Python y un bundle potencialmente mayor que opciones más ligeras.
