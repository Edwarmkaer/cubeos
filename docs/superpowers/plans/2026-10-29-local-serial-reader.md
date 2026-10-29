# Lector local serial — Implementation Plan (primer PR)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development only if Edwar chooses delegated execution. Implement task-by-task after plan review.

**Goal:** Iniciar y detener una estación local preparada que aprovisione una fuente serial repetible y muestre telemetría v2 en el Visor, sin Go instalado en el host.

**Architecture:** Conservar API Go, PostgreSQL y web Next preparada en Compose. Añadir un bootstrap Node/pnpm separado del desarrollo y un comando administrativo local para aprovisionamiento transaccional. La identidad del lector queda persistida en configuración privada y DB; no se publica ni crea telemetría automáticamente.

**Tech Stack:** Node.js 22.23.2, pnpm 11.22.0, Docker Compose v2, PostgreSQL 17.6-alpine; Go 1.27.1 solo para desarrollo/build; driver serial existente go.bug.st/serial v1.6.4. Sin nuevas dependencias de runtime de JavaScript.

**Spec:** [Recepción primero](../specs/2026-10-29-cubeos-telemetry-first-design.md), aprobada en este chat. Este plan cubre solo su primer PR; Convex, Vercel y firmware tienen entregas posteriores.

## Global Constraints

- No desarrollar ahora cuentas Clerk, alias, progreso, guía, análisis cloud ni UI nueva.
- No cambiar campos/unidades del payload v2.
- No compilar Go/Next en cada arranque. Primera descarga/preparación necesita red.
- Parar conserva volúmenes y fotos. `pnpm dev` sigue disponible.
- No instalar daemon de sistema/autostart en el primer PR.
- No privileged, host networking, chmod 777, selección automática de puerto ni flasheo.
- Los cambios Pencil locales y los almacenes existentes se preservan; no son parte del PR.
- No usar ramas codex/ ni atribución IA en commits. Runners del SHA final antes de solicitar merge.

## Review Focus

1. Arranques concurrentes o proceso interrumpido: un binding produce exactamente un dispositivo/fuente (tareas 1, 3).
2. DB restaurada, binding revocado o manifiesto corrupto: falla explícita, sin adoptar registros por nombre o borrar datos (tareas 1, 2, 3).
3. Dos checkouts o puertos ocupados: no aceptar readiness ajeno ni tocar otra instalación (tareas 2, 3, 5).
4. USB desaparece, cambia de nodo o ya está abierto: diagnóstico accionable, sin permisos globales ni estado verde falso (tareas 2, 4, 5).
5. Entorno con secrets/config cloud exportados: ignorarlos, mantener loopback/local y no imprimirlos (tareas 2–5).

## Preparación y archivos

Ejecutar en worktree aislado desde el main remoto verificado, rama propuesta
`feat/local-serial-reader`. No mover/stashear los cambios existentes. Copiar solo
la spec aprobada y este plan al worktree. No iniciar servicios en la instalación
del usuario para verificar: smoke usa una copia descartable y puertos propios.

Archivos nuevos:
- `apps/api/internal/storage/migrations/006_local_receivers.sql`: binding local estable.
- `apps/api/internal/receiver/provision.go`, `provision_test.go`: aprovisionamiento.
- `apps/api/cmd/server/receiver.go`, `receiver_test.go`: interfaz administrativa local.
- `tools/runtime/config.mjs`, `config.test.mjs`: configuración y validación pura.
- `tools/runtime/compose.mjs`, `compose.test.mjs`: invocación Docker sin shell.
- `tools/runtime/index.mjs`, `runtime.test.mjs`: CLI y ciclo de vida.
- `infra/docker/compose.runtime.yaml`: instalación completa sin build implícito.
- `tools/runtime/smoke.mjs`: gate real de ciclo de vida y recepción serial.
- `apps/web/tests/browser-serial.mjs`: comprobación del Visor con datos ya recibidos.
- `docs/local-receiver.md`: instrucciones operativas verificadas.

Archivos existentes a modificar: `apps/api/cmd/server/main.go`, `package.json`,
`turbo.json`, `.github/workflows/ci.yml`, `README.md`, `progress.md`. No cambiar
`tools/dev/local.mjs` ni sus garantías: la interfaz de uso es independiente.

## Task 1: binding serial atómico y comando administrativo

**Interfaces:** `receiver.Ensure(ctx context.Context, pool *pgxpool.Pool, bindingID string) (Binding, error)`;
`Binding` contiene `bindingId`, `deviceId`, `sourceId`, `protocolDeviceId` JSON.
`server prepare-receiver` consume por stdin JSON estricto `{"bindingId":"UUID"}`
y produce un Binding JSON por stdout. Solo modo local; timeout de operación 10 s.

- [ ] Escribir tests Go que fallen: dos Ensure concurrentes con el mismo UUID
  devuelven los mismos IDs y exactamente una fila de binding/dispositivo/fuente;
  binding ajeno, UUID inválido y fuente revocada no crean/modifican registros.
- [ ] Ejecutar desde `apps/api`: `go test -count=1 ./internal/receiver ./cmd/server`
  con `TEST_RECEIVER_DATABASE_URL` exclusivo. Confirmar fallo por ausencia de código.
- [ ] Crear migración 006: tabla `local_receivers` con `id uuid PRIMARY KEY`,
  `device_id uuid NOT NULL UNIQUE REFERENCES devices(id)` y
  `source_id uuid NOT NULL UNIQUE REFERENCES ingestion_sources(id)`. Sin borrar
  en cascada el dispositivo al eliminar un binding. Verificar relaciones/propiedad
  y transport='serial' al reutilizar; no agregar porcentajes ni usuarios.
- [ ] Implementar Ensure en una transacción con lock por binding. Usar principal
  `identity.Local`, protocolo fijo `CS01`, nombre `ESP32-C3 · datos sintéticos` y
  gatewayId `ESP32C3-SYNTHETIC`; crear fuente serial con hash de secreto aleatorio
  no devuelto. Reutilizar binding íntegro activo; nunca buscar/adoptar por nombre.
- [ ] Conectar comando en main sin iniciar servidor HTTP/serial. Rechazar argumentos
  extra, entrada >4 KiB, claves desconocidas, JSON adicional y modo público.
  stdout solo resultado; errores/logs sin credenciales ni DATABASE_URL.
- [ ] Añadir tests de rollback a mitad de creación, relación fuente/dispositivo
  inconsistente, mismo binding con propietario distinto y modo público rechazado.
- [ ] Ejecutar tests con PostgreSQL y `go test -race -count=1 ./internal/receiver ./cmd/server`;
  añadir env a allowlist Turbo y DB exclusiva al gate Go (ninguna DB de alumnos).
- [ ] Commit solo archivos de esta tarea: `feat: provision repeatable local serial receivers`.

## Task 2: configuración privada y preflight sin efectos secundarios

**Interfaces:** `loadRuntime(root, create): Promise<RuntimeConfig|null>`;
`parseStartArgs(args): {serialPath:string|null, baud:number}`;
`inspectSerial(path): Promise<{realPath:string,gid:number}>`;
`projectName(root): string`. Exportar desde `tools/runtime/config.mjs`.

- [ ] Escribir tests Node que fallen: setup repetido conserva binding/password;
  status/doctor/stop sin setup no crean nada; config ilegible/symlink/permisos
  públicos/JSON desconocido/serial regular-file se rechazan sin reescribir.
- [ ] `node --test tools/runtime/config.test.mjs`: observar fallo esperado.
- [ ] Configurar `.cubeos/runtime/config.json` con creación exclusiva 0600 y
  directorio 0700: schemaVersion=1, bindingId UUID, contraseña aleatoria 48hex,
  webPort=3000, apiPort=8080, revision de imágenes y serial opcional. Imágenes de
  dev/runtime, envfiles y fotos de desarrollo no se adoptan implícitamente.
- [ ] Serial solo por `--serial /dev/serial/by-id/... --baud 115200`; aceptar
  también `/dev/ttyACM*`/`ttyUSB*` y `/dev/pts/<entero>` explícitos y resolver symlink a dispositivo de
  carácter. No abrir el puerto para inspeccionarlo. Rechazar baud no entero o
  fuera de 1..4000000 (igual que config Go); default 115200 con puerto indicado.
- [ ] Proyecto Compose `cubeos-runtime-<12hex sha256(ruta absoluta)>`, distinto
  de `cubeos-dev-*`/`cubeos-local`; registrar ruta raíz en config y rechazar copia
  de config desde otro checkout, con mensaje de backup/restore explícito.
- [ ] Validar Linux, Node/pnpm fijados, Docker Engine y Compose v2. No exigir Go
  ni Arduino CLI para usar imágenes. Filtrar entorno heredado con allowlist y
  fijar local/local, loopback, media local, Clerk/serial/Wi-Fi/cloud desactivados
  salvo la opción serial validada. No instalar herramientas silenciosamente.
- [ ] Tests para puerto ocupado, symlink roto, GID extraído, ROOT distinto,
  secrets exportados, error de Docker y ninguna modificación de permisos del SO.
- [ ] `node --test tools/runtime/config.test.mjs`: PASS; commit
  `feat: validate private local reader configuration`.

## Task 3: setup/start/status/stop usando imágenes preparadas

**Interfaces:** `runCompose(config, args, options): Promise<{stdout:string}>`
en `compose.mjs` invoca Docker con argv, nunca shell. `main(args): Promise<number>`
en `index.mjs` acepta setup/start/status/stop/doctor, exit codes 0 éxito, 1 fallo,
2 argumentos inválidos. `main` importable sin iniciar servicios.

- [ ] Tests con runner inyectado observan orden y ausencia de operaciones
  destructivas: setup DB→migrate; start provision→API→web→readiness; stop solo
  servicios del proyecto. Invocar `node --test tools/runtime/compose.test.mjs tools/runtime/runtime.test.mjs`
  y observar RED antes de implementar.
- [ ] Añadir compose.runtime.yaml con imágenes API/web explícitas y DB 17.6,
  volúmenes nombrados propios, API/web solo 127.0.0.1 y DB no publicada.
  Serial overlay existente se utiliza solo con puerto+GID+sourceId validados.
  Env de migrate/provision NO incluye serial; API recibe binding resuelto.
- [ ] Setup por defecto obtiene imágenes GHCR `cubeos-api`/`cubeos-web` con tag
  `sha-<git HEAD completo>` confiable; verificar label revision y registrar
  digest. Si no están publicadas, fallar con instrucción, no usar latest ni tags
  pr10 por defecto. `setup --build` explícito construye API/web una vez con Docker
  para revisión local del PR y guarda IDs; no requiere Go host. Nunca loguear env.
- [ ] Setup deja DB migrada y luego detenida si no estaba ya iniciada por esta
  instalación. No crea dispositivo hasta start. Impedir setup/start concurrentes
  mediante lock en directorio privado; proceso interrumpido deja recuperación
  verificando PID/identidad, no borrando un lock arbitrario activo.
- [ ] Start exige setup existente, comprueba puertos si servicios no son propios,
  inicia DB, ejecuta prepare-receiver con binding por stdin y guarda solo IDs
  validados; reusa IDs tras reinicio. Inicia API/web `--no-build --pull never`.
  Tras timeout informa servicios fallidos y preserva datos; rollback detiene
  únicamente servicios creados por ese intento, no los que ya estaban activos.
- [ ] Status confirma identidad Compose e informa servicios, `/readyz`, fuente,
  dispositivo y antigüedad de última recepción; readiness de API no equivale a
  recepción serial. No consumir/modificar el puerto para hacer status.
- [ ] Stop usa compose stop, nunca down -v/rm/prune, y no crea configuración.
  Manejar SIGINT/SIGTERM del wrapper sin dejar operaciones hijo sueltas.
- [ ] Añadir scripts `local:setup/start/status/stop/doctor`; incluir tests runtime
  en `pnpm test`. Repetir tests Node hasta PASS y commit
  `feat: start and stop the prepared local reader runtime`.

## Task 4: diagnóstico, recepción sintética y reconexión honesta

**Interfaces:** doctor retorna JSON interno `{checks:[{name,state,message}],ready}`,
salida humana por defecto sin secretos; exit 1 para un prerrequisito obligatorio
fallido. No afirmar conectividad física si solo existe puerto de carácter.

- [ ] Tests RED cubren placa ausente/puerto ocupado, permisos/GID incompatibles,
  Docker sin acceso, falta de imágenes, DB no lista, config serial incompleta y
  status sin muestras. Logs nunca contienen contraseña o env completo.
- [ ] Implementar doctor en `index.mjs`/`config.mjs`, reutilizando inspectores sin
  efectos secundarios. Puerto posiblemente ocupado se informa con instrucción
  de cerrar Serial Monitor; no matar procesos ni desbloquear dispositivos.
- [ ] Si cambia el nodo físico de un symlink serial, pedir `local:start` para
  recrear SOLO API con mapeo nuevo. No prometer hotplug automático de Docker.
  Si se recupera el mismo nodo, conservar backoff serial Go existente.
- [ ] Instrucciones muestran Configuración→API local→dispositivo aprovisionado;
  no seleccionar otro registro por defecto. Evidencia sintética en nombre/contexto
  de prueba, nunca alterando el payload v2 para añadir campos.
- [ ] Repetir tests Node y suites de transporte Go; commit
  `feat: diagnose serial reader readiness and recovery`.

## Task 5: gate real de runtime, serial, persistencia y navegador

**Files:** smoke.mjs, browser-serial.mjs, ci.yml. Añadir job `local-reader`,
necesario en `ci-required`, sin retirar ninguno de los diez jobs existentes.

- [ ] Smoke exige `CUBEOS_RUNTIME_SMOKE=1`, checkout descartable y puertos libres;
  toma ownership de sus recursos. Fallar si recibe la raíz de la instalación del
  alumno. Nunca ejecutar suites DROP SCHEMA sobre su DB. Observar RED contra
  CLI/scripts ausentes antes de marcar el gate como implementado.
- [ ] Probar setup --build dos veces; mismos secretos/binding. Start sin placa,
  no hay muestras sintéticas automáticas. Verificar usuario de contenedores no
  root, permisos y superficie de red. Importar foto de prueba por API normal.
- [ ] Para serial real de software, el test crea PTY en host con `golang.org/x/sys/unix`,
  siguiendo `apps/api/internal/ingestion/serial_linux_test.go`, conserva master abierto e imprime solo
  ruta del slave. El overlay de CI da al contenedor exclusivamente ese PTY y
  GID; cerrar por señal al finalizar. Node genera envelopes con el simulador
  existente y escribe al master a través del helper, no inserta SQL de muestras.
  El helper vive en `apps/api/cmd/serial-smoke/main.go` y solo se compila en tests.
  Su stdin recibe NDJSON para copiar al master; su stdout inicial informa el slave.
- [ ] Ingerir normal/failures/reboot/silencio; comprobar raw, snapshot y revisión
  mediante API. Abrir web real con Playwright y confirmar tendencias/antigüedad,
  ausencia de datos DEMO y recuperación SSE. Bloquear/registrar egress externo.
- [ ] Repetir start/status, detener/reiniciar; mismos IDs, foto SHA intacta e
  historial conservado. Error ante puertos ocupados por otro proceso. Volver a
  pasar un PTY nuevo tras desconexión recreando solo API, sin duplicar binding.
- [ ] Con imágenes ya preparadas, usar red interna sin egress y verificar datos
  desde dentro de contenedores; prueba de navegador offline con egress bloqueado
  separada, sin afirmar que puertos publicados siguen accesibles con red interna.
- [ ] Cleanup mediante stop solo de recursos propios; conservar evidencia de
  volúmenes/fotos sin listar secretos. El timeout no deja procesos PTY/Compose.
- [ ] `node tools/runtime/smoke.mjs` con opt-in y puertos propios: PASS; job CI
  vuelve a ejecutar con DB exclusiva. Commit `test: verify the local serial reader end to end`.

## Task 6: documentación y entrega del PR

- [ ] Documentar en docs/local-receiver.md requisitos Linux/Node/pnpm/Docker,
  comandos reales, selección de puerto, instalación inicial y uso sin red,
  doctor/logs, permisos/Serial Monitor, start sin placa y recuperación por hotplug.
  Aclarar que pnpm local:* aún NO conecta Convex/Vercel: PR posterior.
- [ ] README enlaza operación para alumnos y desarrollo para contribuidores.
  progress registra evidencia de este PR sin apropiarse de notas Pencil; no
  cambiar DESIGN.md ni proclamar despliegue cloud. En el worktree copiar solo
  la spec aprobada y este plan, no otros cambios del checkout inicial.
- [ ] Verificar enlaces y ejecutar frozen install, lint, typecheck, tests y build;
  Go con bases descartables y Docker smoke. CI no debe convertir integración
  omitida en éxito. Registrar comandos y resultados reales por SHA.
- [ ] Revisión independiente del diff completo; corregir fallos antes de publicar.
  Commit `docs: explain local serial reader installation and operation`.
- [ ] Abrir PR `feat: prepare the local serial reader`, adjuntarlo al chat y
  esperar runners. No cerrar #14–#17 ni afirmar hardware físico listo. No merge
  sin petición explícita; comandos finales deben corresponder al SHA del PR.

## Entregas posteriores, no implementadas por este plan

Tras este PR: plan específico para Convex+relay y permisos temporales; después
Vercel y smoke público; después `.ino` ESP32-C3 con compilación y prueba física.
Clerk/progreso/fotos cloud siguen fuera. Confirmación de arquitectura no equivale
a confirmar readiness de esos proveedores. No usar el firmware para compensar
un fallo del servicio receptor ni anunciar datos del PTY como datos de la placa.

## Revisión del plan

Cobertura de este PR: bootstrap/servicio lector/diagnóstico/serial/persistencia/
offline preparado y evidencia de navegador. No queda implícita la transmisión
cloud ni la prueba física. Los cinco riesgos de Review Focus tienen tests en las
tareas indicadas. Interfaces de provisión no devuelven secretos. No se modifican
documentos/artefactos de diseño ajenos ni se instala software de sistema ahora.
