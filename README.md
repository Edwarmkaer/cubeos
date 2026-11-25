# CubeOS

Estación de tierra en el navegador: telemetría en vivo de tu placa y armado 3D
paso a paso. Proyecto personal (hardware + web).

## Desarrollo

Node.js `22.23.2` (`.node-version`) y pnpm `11.22.0`.

```bash
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

Verificación: `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Estructura

- `apps/web` — Next.js (App Router), Tailwind, Zustand, React Three Fiber.
- `packages/ui` — tokens y componentes compartidos.
- `packages/telemetry` — tipos de telemetría.

Producto: [PRODUCT.md](PRODUCT.md) · Diseño: [DESIGN.md](DESIGN.md) ·
Roadmap: [docs/roadmap.md](docs/roadmap.md).

La versión anterior con backend Go/PostgreSQL está en el tag `legacy/cubeos-v1`.
