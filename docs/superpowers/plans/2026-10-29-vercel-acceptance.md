# Vercel y aceptación cloud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution after Edwar reviews this plan. Steps use checkbox syntax for tracking.

**Goal:** Entregar una URL verificable en Vercel recibiendo la réplica del lector local a través de Convex.
**Architecture:** Solo Next.js en Vercel; Convex recibe última proyección; Go y PostgreSQL permanecen locales. Primero preview verificada, después publicación del mismo alcance solicitado.
**Tech Stack:** Vercel Git integration/MCP, Next.js/pnpm/Turbo existentes, Convex CLI, Playwright.
**Spec:** [Recepción primero](../specs/2026-10-29-cubeos-telemetry-first-design.md).

## Global Constraints

- Depende del PR [cloud](2026-10-29-cloud-telemetry.md) verde, no de su merge automático.
- Equipo Vercel comprobado: `edwarmkaers-projects` / `team_37jALHTMMEJBAdrILl5zNOYD`.
- Nombre propuesto del proyecto nuevo: `cubeos`; repo `Edwarmkaer/cubeos`, raíz `apps/web`.
- Solo planes Free/Hobby sin consumo medido. Detenerse si exige upgrade o cobro.
- Ninguna clave deploy/admin/publicación/lectura se incluye en NEXT_PUBLIC ni Git.
- No publicar Go/PostgreSQL en Vercel, no dominio de pago, no fotos cloud.

## Review Focus

1. Equipo/proyecto/SHA equivocados: verificar identidad antes de cada publicación.
2. Build público sin Clerk o API local: se abre, solicita acceso cloud y no consulta localhost.
3. Secrets en bundles/logs/traces: impedirlos y usar canales efímeros de ensayo.
4. Build sano pero relay roto: no declarar listo sin lectura nueva y pérdida/retorno de red.
5. Plan gratuito no comprobable: informar bloqueo sin activar facturación ni simular nube con mock.

## Task 1: preparar destino y configuración reproducible

**Files:** crear `apps/web/vercel.json`, `tools/cloud/check-deployment.mjs` y tests,
`docs/cloud-deployment.md`; modificar `docs/deployment.md` para marcar Railway
como histórico de esta etapa sin eliminar su configuración/recuperación existentes.
**Interfaces:** `checkDeployment({teamId,projectId,commit,url,expectedConvexURL})`
rechaza destino/SHA/origen incorrectos; salida solo IDs, URL, revisión y estado.

- [ ] RED: tests de URLs/objetivo incorrectos y detección de variables privadas
  incluidas indebidamente en configuración pública.
- [ ] Confirmar mediante acceso autenticado plan real/team Convex y cuotas, no
  deducirlo de pricing público o existencia de auth. Si no se puede comprobar,
  pedir únicamente la acción exacta necesaria al propietario.
- [ ] Crear/vincular proyecto cloud y Vercel únicamente en el equipo confirmado;
  no reutilizar proyectos parecidos. Root Directory en settings, no en vercel.json.
- [ ] Configurar solo URL pública Convex y modo cloud web; despliegue de funciones
  Convex vía cuenta autenticada. No modificar el modo public/Clerk de la API Go.
- [ ] GREEN: typecheck/push Convex, build Next público sin Clerk ni localhost;
  inspección exacta de proyecto/entorno/SHA y configuración sin secretos.
- [ ] Commit: `chore: configure the Vercel telemetry frontend`.

## Task 2: aceptación real y gates

**Files:** crear `tools/cloud/acceptance.mjs`, `apps/web/tests/browser-cloud-live.mjs`,
`.github/workflows/cloud-acceptance.yml`; modificar gate requerido en CI sin quitar los anteriores.
**Interfaces:** runner recibe URL/SHA y rutas privadas de credenciales efímeras;
emite resultado/hash/revisiones/edad, nunca tokens ni contenido de archivos privados.

- [ ] RED: preparar prueba con navegador abierto que falla si solo existe el snapshot
  anterior, si el dispositivo/canal es distinto o si se refrescan timestamps al replicar.
- [ ] Preview: PTY → lector Go real → PostgreSQL → relay → Convex real → navegador
  Vercel; exigir dos revisiones distintas y el valor nuevo visible sin recarga.
- [ ] Cortar acceso cloud del relay sin romper DB local; comprobar avance local,
  envejecimiento remoto y recuperación de última lectura sin replay del backlog.
  Probar canal B, publicación con token read, revocación y expiración reales.
- [ ] Gates sin secretos en todos los PRs; aceptación cloud con credenciales solo
  en ejecución manual autorizada o rama protegida. No secretos para forks.
- [ ] Revocar canales de prueba y apagar relay al finalizar. No borrar datos del usuario.
- [ ] GREEN: runners del SHA final y reporte con URL, entorno, SHA, funciones
  desplegadas y prueba funcional; diferenciar READY de prueba física pendiente.
- [ ] Commit: `test: verify live telemetry through Convex and Vercel`.

## Task 3: entrega

- [ ] Abrir/adjuntar PR `chore/vercel-telemetry`, enlazado a su dependencia, sin merge.
- [ ] Inspeccionar errores runtime tras despliegue; documentar límites Free,
  cómo revocar acceso, apagar relay y volver a modo local.
- [ ] Entregar URL funcional solo después del recorrido real. No registrar la
  ESP32 como ensayada: ese cierre pertenece a la siguiente entrega.
