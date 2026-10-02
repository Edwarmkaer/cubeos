# Desarrollo local con pnpm y Turbo

Requisitos: Node.js de `.node-version`, pnpm de `packageManager`, Go de
`.go-version`, Docker Engine activo y Docker Compose v2 con `up --wait`.
No se instalan herramientas globales ni se requiere Clerk, Railway o S3.
Si Go ya está instalado fuera de PATH, añadir su carpeta `bin` al PATH del shell.

Desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

`setup` verifica herramientas, crea `.env.development.local` con contraseña
aleatoria y permisos 0600 únicamente si no existe, inicia PostgreSQL 17.6 y
aplica migraciones. Se puede repetir: no cambia credenciales existentes ni borra
datos. El archivo acepta solo `POSTGRES_PASSWORD` (24+ caracteres URL-safe) y
`PG_PORT` (default 54329). No es un script shell. No cambiar la contraseña de
una base ya inicializada: cambiar el archivo no cambia la contraseña en PostgreSQL.

`dev` repite la preparación y ejecuta `turbo run dev`: Next.js y Go nativos,
web en <http://localhost:3000>, API en <http://localhost:8080>. Las variables se
cargan automáticamente, sin exportaciones manuales. Ambos servicios y PostgreSQL
se publican solo en loopback. Puertos 3000/8080 ocupados causan un error explícito;
no se elige otro puerto porque rompería el origen permitido. PostgreSQL usa el
proyecto Compose `cubeos-dev-<hash de la ruta del checkout>` y su volumen
`postgres-data`; no comparte DB con otros checkouts, Compose completo o pruebas anteriores.
Otra copia puede ajustar PG_PORT para no competir por el mismo puerto.
Mover la carpeta cambia la identidad: hacer backup antes de mover una instalación.
`go run` no incluye hot reload: reiniciar `pnpm dev` tras editar Go; Next sí recarga.

Abrir Configuración, seleccionar API local `http://localhost:8080`, registrar
un dispositivo y elegirlo. Para fotos, importar un JPEG/PNG desde Configuración.
Originales y miniaturas viven en `.cubeos/media`; temporales en
`.cubeos/media-staging`. Estas carpetas y el envfile están ignorados por Git.
Conservar DB **y** fotografías juntos; backup/restauración en [backups](backups.md).
El setup no inserta telemetría ficticia, fotografías ni pasos educativos.

Para detener:

```bash
# Ctrl+C en la terminal de pnpm dev: detiene web/API.
pnpm stop
```

`stop` detiene únicamente PostgreSQL de este checkout; conserva el volumen y las
fotos, no detiene otros proyectos y no crea configuración si no existe.
No ejecutar `down -v` sobre una instalación con datos que quieras conservar.

`pnpm build`, `pnpm lint`, `pnpm test` y `pnpm typecheck` mantienen sus tareas
Turbo. Pruebas Go de integración requieren bases descartables distintas de la
DB de desarrollo: [API](../apps/api/README.md). CI añade `developer-workflow`,
con setup repetido, web/API reales y persistencia de dispositivo y foto exacta
tras reiniciar. El smoke escribe datos de prueba; ejecutar solo en instalación
exclusiva de verificación, no sobre una base de alumnos.

## Docker completo y offline

El Compose existente sigue disponible como alternativa en
[API](../apps/api/README.md). No ejecutar ambos modos en 3000/8080 al mismo tiempo.
El desarrollo nativo puede descargar módulos y recursos del mapa; no acredita
offline. Para ejecución sin Internet preparar previamente imágenes, dependencias
y fuentes, y usar el modo Docker descrito allí. Mapas offline requieren assets locales.
