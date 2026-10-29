# Web en Vercel, estación local

La recepción, PostgreSQL, historial y fotos permanecen locales. Solo la web Next.js
se publica en Vercel; Convex recibe la última lectura del relay opt-in.
No hay API Go ni USB en Vercel. [Operación del relay](cloud-telemetry.md).

Destino aprobado: equipo `edwarmkaers-projects`, proyecto `cubeos`
(`prj_mYy9bdjG5jHSGK2NdM0Hlt3o4QAy`), repo `Edwarmkaer/cubeos`, Root Directory
`apps/web`, archivos externos a esa raíz habilitados para paquetes compartidos,
Node 22.x. La raíz se configura en settings, no en vercel.json.
La cuenta autenticada indica Hobby activo, sin exceso de Data Cache habilitado.
No se activó un plan de pago ni se solicitó build machine de pago.

Configuración pública (preview y producción):

```dotenv
DEPLOYMENT_MODE=cloud
NEXT_PUBLIC_CONVEX_URL=https://mellow-roadrunner-811.convex.cloud
```

No añadir claves administrativas, deploy keys, claves de publicación ni lectura
a variables NEXT_PUBLIC. El navegador pide canal/clave temporal al estudiante y
no necesita Clerk. El modo anterior public/Clerk no se ha eliminado.

Convex producción: `mellow-roadrunner-811`; desarrollo: `adamant-antelope-864`.
Las funciones están desplegadas con CLI autenticada, validación de tipos e índices.
Para crear/revocar un canal, seleccionar explícitamente el deployment adecuado;
el CLI de aprovisionamiento ya lo deriva de las URLs recibidas.

Git integration puede crear previews automáticamente, pero READY no equivale a
aceptación funcional. Verificar equipo/proyecto/SHA, health cloud y recorrido real
de una lectura nueva antes de entregar una URL. Los PRs siguen sin merge automático.
Las previews pueden estar protegidas por Vercel Authentication; esa protección no
es el login del producto. No compartir bypass keys ni trazas con credenciales.

Next conserva standalone para Docker y usa el adapter nativo cuando VERCEL=1.
Es necesario porque el hook de build de Vercel gestiona sus propios traces.
Railway se mantiene como configuración histórica recuperable, no destino activo.

Límites Free dependen del servicio y pueden cambiar; no se promete disponibilidad
ilimitada. Detener relay y revocar canales al terminar prácticas. Si se agotan las
cuotas, el lector local sigue siendo el camino funcional sin coste cloud.

## Aceptación reproducible

Obtener con la cuenta autenticada de Vercel el deployment READY, su URL inmutable
(no alias), project/team IDs y commit SHA. Guardar un registro sin secretos:

```json
{"teamId":"team_37jALHTMMEJBAdrILl5zNOYD","projectId":"prj_mYy9bdjG5jHSGK2NdM0Hlt3o4QAy","commit":"SHA_COMPLETO","url":"https://cubeos-HASH-edwarmkaers-projects.vercel.app","state":"READY","environment":{"DEPLOYMENT_MODE":"cloud","NEXT_PUBLIC_CONVEX_URL":"https://mellow-roadrunner-811.convex.cloud"}}
```

Con las imágenes locales preparadas, helper serial compilado y sesión administrativa
Convex válida, ejecutar desde la raíz:

```bash
CUBEOS_LIVE_ACCEPTANCE=1 CUBEOS_EXPECTED_COMMIT=SHA_COMPLETO \
CUBEOS_CLOUD_WEB_URL=https://cubeos-HASH-edwarmkaers-projects.vercel.app \
CUBEOS_SERIAL_HELPER=/ruta/serial-smoke \
node tools/cloud/acceptance.mjs /ruta/deployment.json
```

La prueba crea su canal y runtime exclusivos, exige nuevos valores, pérdida/retorno
de red, revocación y vencimiento real de una suscripción. Los secretos no forman
parte del registro ni del reporte. Para previews protegidas se requiere acceso
temporal válido del proyecto; no desactivar protección para hacer pasar pruebas.

Workflow manual `cloud-acceptance.yml`: solo main, environment `cloud-acceptance`.
El propietario debe configurar revisores/ramas permitidas y el secreto
`CONVEX_DEPLOY_KEY` limitado al deployment de producción. Configurar la variable
`DEPLOYMENT_RECORD` con el registro autenticado anterior del mismo github.sha.
La preparación sin secretos ocurre antes del único paso que los recibe. No se ha
copiado la sesión administrativa local a GitHub ni configurado ese secreto desde
este chat; el ensayo local autenticado no equivale a haber ejecutado ese workflow.
