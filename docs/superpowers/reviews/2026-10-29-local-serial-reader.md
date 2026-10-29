# Lector local: revisión y evidencia

Alcance: primer PR del plan del lector local. No acredita hardware físico,
firmware, Convex ni Vercel desplegados.

## Revisión independiente y corrección

Revisión read-only de `4dd9b0e..6480483`: sin críticos; cinco importantes,
aceptados y corregidos en una pasada. Sin segunda revisión delegada.

1. Reutilizar ruta/GID no garantizaba renovar un inode USB. Cada start recrea
   exclusivamente API, no web/DB; test exige el argv correspondiente.
2. Setup podía escribir configuración anterior a otra operación. Recarga dentro
   del lock; test reproduce una escritura entre checkTools y adquisición del lock.
3. SIGTERM podía quedar absorbido y dejar descendientes. Cancelación de operación,
   proceso/grupo propio, escalado acotado y readiness sin reintentos de cancelación.
   Tests cubren hijo con salida cero y descendiente que ignora SIGTERM.
4. Doctor aceptaba TTY 0600 de otro UID. Se comprueba lectura/escritura para UID
   10001 y GID suplementario antes de iniciar; sin abrir ni cambiar el puerto.
5. Smoke aceptaba el snapshot anterior como reconexión. Ahora exige revisión
   mayor y temperatura distinta, con navegador abierto durante la recreación API;
   la nueva lectura llega sin recargar el Visor.

Las nuevas pruebas reprodujeron fallos antes de las correcciones. Después:
18/18 tests runtime; lint, typecheck, test y build raíz; Go receiver/server race
con PostgreSQL exclusivo; smoke completo en instalación descartable
`/tmp/cubeos-reader-smoke-4JMzM7`. Incluye PTY real, Go/PostgreSQL, navegador/SSE,
envejecimiento, reconexión incluso reutilizando `/dev/pts/0`, foto byte a byte,
restart e instalación preparada en red Docker interna sin Internet.

El primer runner remoto falló en setup del fixture; se añadió diagnóstico con
credencial efímera redactada. No se declara CI final verde por evidencia local.

## Decisiones durante ejecución

- Docker usa contexto default local, no el remoto exportado. Contextos rootless
  personalizados quedan pendientes.
- Binding restaurado se verifica transaccionalmente por IDs esperados; falla
  cerrado si DB/config no coinciden, sin crear otro dispositivo.
- Build explícito requiere Buildx; uso normal de imágenes preparadas no. En este
  host se reutilizó un plugin privado ya verificado, sin instalación global.
- Recuperación de lock muerto es explícita y comprueba PID/root; PID reutilizado
  o un guard interrumpido requieren inspección, no borrado automático.
- TTY usa device cgroup y bind del mismo nodo para PTY; no privileged ni /dev
  completo. Hotplug necesita repetir start para renovar el mapeo API.
- Smoke usa instalaciones aleatorias propias y down sin -v para liberar redes;
  datos/fotos quedan recuperables. Stop del usuario no borra volúmenes.
- Se actualizó la base remota antes de publicar, preservando el progreso Pencil.
  No se modificó el checkout con trabajo del usuario ni se hizo force-push.
- Helpers de skills no ejecutables se invocaron con bash; seguimiento manual en
  ledger propio, sin chmod global.
- Tabla de binding guarda identidad local, no progreso ni migración cloud.
- Fixture de smoke no tiene dependencias JS; desactiva solo allí la verificación
  automática de dependencias de pnpm. Runtime real conserva su política.

Pendiente posterior: PR de última instantánea Convex con acceso acotado,
conexión Visor/Vercel y finalmente firmware ESP32-C3 para prueba física.
