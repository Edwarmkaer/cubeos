# Revisión de réplica cloud — 2026-10-29

Base: `22906fc07977446511cfb39ed7b5982a9ff2cf64`. Revisión independiente de la rama
completa y cambios pendientes. Sin críticos; dos importantes corregidos, sin menores.

1. El efecto inicial cloud ocurría antes de suscribirse el formulario al store.
   Se invirtió el orden. La prueba de navegador de un build cloud fresco falló
   esperando la clave de consulta antes de reconstruir y pasó tras la corrección.
   Ese gate ahora corre en CI sin credenciales remotas.
2. El aprovisionamiento usaba el deployment por defecto de CLI. Ahora
   `--deployment` se deriva del origen Convex solicitado y validado, con prueba
   RED→GREEN para la selección B independientemente del deployment A configurado.

Verificación posterior: test/lint/typecheck Turbo 20/20 tareas; runtime/admin 23/23;
build cloud de Next y prueba de navegador fresco aprobados. Ensayo real con
instalación Docker temporal: PTY → Go → PostgreSQL → SSE/browser local y relay →
Convex → browser cloud, dos cambios de temperatura, caída de red cloud sin frenar
DB local, recuperación de última lectura y revocación con navegador abierto.
Reinicio offline y conservación exacta del original fotográfico comprobados.
Los canales de ensayo fueron revocados. No acredita hardware físico ni Vercel.

## Decisiones del implementador

- Reutilizar worktree aislado; PR dependiente del lector local mientras no se integre.
- El cliente privado usa solo revisionId decimal; el wire REST permanece compatible.
- Se adelantaron pruebas Go mientras se descargaban dependencias, sin adivinar APIs.
- Codegen offline oficial inicial fue sustituido por artefactos generados del
  deployment real; no queda generador auxiliar ni cast de componente provisional.
- Diagnósticos Node de esta máquina usan IPv4 por timeout de autoselección; no se
  modificó TLS ni la configuración global de red.
- Disable retira la credencial sin recrear API ni requerir USB conectado; un volumen
  privado vacío puede quedar montado hasta el siguiente inicio normal.
- El camino SQL del relay se verificó con la instalación PostgreSQL real de extremo
  a extremo, en lugar de duplicar un fixture unitario de repositorio. La aceptación
  cloud necesita conexión y cuenta administrativa y se ejecuta opt-in.
- Los controles viven en settings-view, dueño existente de Configuración.
- Ausencia de Clerk aprobada para invitados con capability temporal; no se cambió
  la autorización del modo público anterior. v.any está limitado por la validación
  canónica al escribir; la expiración programada invalida consultas abiertas.
- Runners finales y Vercel se comprueban por separado. Compilación/pruebas virtuales
  no sustituyen el ensayo físico de ESP32. No hay merge automático.
