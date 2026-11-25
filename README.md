# CubeOS

Estación de tierra en el navegador: telemetría en vivo de tu placa y armado 3D
paso a paso. Proyecto personal (hardware + web).

## Desarrollo

Node.js `22.23.2` (`.node-version`) y pnpm `11.22.0`.

```bash
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

Verificación: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Uso

- **Conectar**: elige DEMO o USB serial (Chrome/Edge), baudios y formato. Una lectura
  por línea en JSON, CSV o `clave=valor`. Los campos se detectan solos y se editan en el perfil.
- **Visor**: tarjetas generadas desde el perfil, orientación 3D, mapa y grabación a CSV.
- **Armado**: carga un `.glb` y una guía Markdown/JSON; ejemplos en `apps/web/public/examples`.

## Estructura

- `apps/web` — Next.js (App Router), Tailwind, Zustand, React Three Fiber.
- `packages/ui` — tokens y componentes compartidos.
- `firmware/esp32-telemetry` — sketch de ejemplo que emite JSON por USB.

Producto: [PRODUCT.md](PRODUCT.md) · Diseño: [DESIGN.md](DESIGN.md) ·
Roadmap: [docs/roadmap.md](docs/roadmap.md).

La versión anterior con backend Go/PostgreSQL está en el tag `legacy/cubeos-v1`.
