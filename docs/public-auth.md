# Identidad pública y configuración Google/Clerk

PR8 implementa Clerk en la instalación pública y mantiene el perfil local
independiente. Google es el proveedor que configura el propietario; esta entrega
no crea cuentas, proyectos OAuth ni recursos cloud. La preparación con fixtures
no acredita una instalación real de Google/Clerk. Ese smoke sigue sin verificar
hasta contar con una cuenta de prueba y configuración autorizadas.

## Variables y ejecución

| Servicio | Variable runtime | Requisito público |
| --- | --- | --- |
| Web y API | `DEPLOYMENT_MODE` | `public`; por defecto `local` |
| Web | `CLERK_PUBLISHABLE_KEY` | Clave publicable de la instancia Clerk |
| API | `AUTH_MODE` | `clerk`; `local` se rechaza en público |
| API | `DATABASE_URL` | PostgreSQL de esta instalación |
| API | `LISTEN_HOST`, `PORT` | Interfaz/puerto del contenedor detrás del proxy TLS |
| API | `PUBLIC_API_HOST` | Host externo exacto, con puerto si existe; sin esquema/ruta |
| API | `ALLOWED_ORIGIN` | Origen HTTPS exacto de web, sin slash final |
| API | `CLERK_ISSUER` | Origen HTTPS de la Frontend API de la instancia, sin slash final |
| API | `CLERK_JWKS_URL` | Ese issuer + `/.well-known/jwks.json` |
| API | `CLERK_AUDIENCE` | Audiencia que se añade al token de sesión, p. ej. `cubeos` |
| API | `CLERK_SECRET_KEY` | Secret de la misma instancia, solo backend |

Go valida esta configuración al arrancar. Web lee sus variables en el servidor
durante render dinámico y pasa la clave publicable explícitamente al componente
cliente. No usa `NEXT_PUBLIC_CLERK_*` ni requiere secreto de Clerk en web; esos
nombres convencionales serían valores congelados durante build en Next. El mapa
sí conserva su `NEXT_PUBLIC_MAP_STYLE_URL` de build. Preparar dependencias,
assets y la compilación antes de desconectar Internet; la misma imagen web puede
arrancar en local o pública mediante variables runtime.

En local, web no monta ni solicita Clerk y API no consulta JWKS/sesiones. El
Compose local mantiene su perfil y puertos loopback. No convertir ese Compose
en público cambiando únicamente la publicación de puertos: público necesita
TLS, origen/Host y todas las variables anteriores. Tras el proxy, conservar el
Host configurado; `X-Forwarded-Host` no concede permisos. Readiness comprueba DB
y migraciones; no acredita conectividad/configuración del proveedor.

Público con key web ausente/formato roto muestra acceso cerrado. SDK/configuración
remota caída no proporciona un getter válido y no habilita perfil local. La API
rechaza configuración incompleta y falla cerrada ante errores del proveedor.

## Configuración a cargo del propietario

1. Crear/elegir una instancia Clerk separada para este despliegue y configurar
   sus dominios/orígenes HTTPS. Usar Google como conexión social y deshabilitar
   métodos alternativos si el recorrido debe ser exclusivamente Google. El
   botón de CubeOS abre el Account Portal de esa instancia; no implementa ni
   suplanta el formulario de Google.
2. Para producción, configurar el proyecto Google OAuth, consentimiento,
   credenciales y callback exacto que entrega Clerk. Guardar los secrets en el
   proveedor/deployment, nunca en el repo. Configurar la Home URL/retorno del
   Account Portal a `/configuracion` de la instalación pública.
3. Personalizar **el token de sesión**, añadiendo `{"aud":"cubeos"}` (o el
   valor exacto de `CLERK_AUDIENCE`). Se usa `getToken({skipCache:true})`, sin
   plantilla JWT: conservar los claims de sesión `sub/sid/iss/exp/nbf/iat/azp`.
4. Configurar las variables runtime de la tabla para web/API y ejecutar el
   binario `server migrate` con acceso a la DB pública. En público ese comando
   aplica migraciones y **no** crea el perfil local.
5. Inscribir cada subject autorizado con `server enroll SUBJECT DISPLAY_NAME`
   desde el entorno administrativo de API. `SUBJECT` es el ID `user_…` de Clerk,
   obtenido por el administrador; no es el email ni un JWT. Repetir la inscripción
   conserva el UUID interno y no renombra al usuario. `fixture/rebuild` locales
   están deshabilitados en público. La API no inscribe subjects automáticamente.
6. Con cuenta de prueba autorizada, probar entrada/salida de Google, registro de
   dispositivo, REST/SSE, cambio de cuenta, expulsión de sesión en Clerk y
   revocación de fuente. No imprimir bearer al diagnosticar.

Para retirar una inscripción, el administrador elimina su relación Clerk en
`auth_identities` mediante una transacción administrativa con DB confiable.
Esto deniega siguientes solicitudes y cierra SSE durante la revalidación; no
elimina al usuario/dispositivos ni transfiere propiedad. El subject solo puede
resolver una relación existente `(provider='clerk', subject)`; email nunca es FK.
La revocación de una fuente de recepción tiene dueño en
[transportes](hardware-transports.md) y no equivale a cerrar la sesión del alumno.

## Autenticación y autorización

Go acepta Bearer por header, con RS256 y `kid` desde el JWKS configurado. No usa
`jku/x5u/iss` del token como URL de red. Comprueba firma, issuer/audience exactos,
expiración, `nbf`, `iat`, origen `azp`, subject y `sid`, y rechaza sesión pendiente.
Consulta `https://api.clerk.com/v1/sessions/{sid}` y exige sesión activa con ID y
usuario iguales al JWT. HTTP redirects están deshabilitados; cada fetch tiene
timeout 3 s y respuesta máxima 128 KiB dentro del presupuesto de operación 5 s.
Se vuelve a consultar JWKS y estado de sesión sin caché: caída/429/JSON inválido
produce 503, token inválido/revocado o subject no inscrito produce 401. No hay
fallback local. Esto consume llamadas al proveedor por solicitud/heartbeat;
medir cuotas/latencia antes de producción. No se afirma que sea una caché offline.

Cada operación de dispositivo, snapshot, historia, CSV, fuentes y SSE conserva
propiedad en PostgreSQL. UUID ajeno responde 404. La protección frontend no
sustituye estas consultas. El cliente solo conserva el getter en memoria;
CubeOS no guarda bearer en localStorage/sessionStorage, URL, logs ni respuestas.
Clerk administra sus propias cookies de sesión para su protocolo web; la
integración no promete una sesión de Clerk sin cookies.

El cambio de subject **o sesión**, salida o pérdida de sesión invalida generación,
UUID/nombre elegidos, snapshot, tendencias y posiciones. Configuración borra
lista, formularios y errores; cancela REST/SSE y rechaza un token/respuesta tardía
antes de iniciar otra solicitud. La preferencia offline conserva la intención
actual. Cancelar no deshace una escritura que la API ya confirmó.
Los límites de stream/reconexión tienen dueño en [realtime](realtime.md).

## Verificación reproducible y límites

`go test -race -count=1 ./...` requiere bases exclusivas indicadas en
[API](../apps/api/README.md), incluida `TEST_AUTH_DATABASE_URL`. Los tests generan
claves RSA y JWT efímeros, un JWKS/sesiones TLS aislado y usuarios inscritos en
PostgreSQL. Verifican firma/claims/unknown subject, falta del proveedor, permisos
A/B, expiración y revocación del stream idle, e ingestión denegada tras revocar
fuente. El transporte HTTP de fixture se conecta solo en tests; el binario
productivo no incorpora resolver falso ni variable para activarlo.

`CUBEOS_AUTH_BROWSER=1 go test -race -count=1 -v ./internal/http -run
TestPublicIdentityOwnershipRevocationAndBrowser` añade Chromium contra la API
Go/DB reales. Bundling de `apps/web/tests/auth-browser-fixture.tsx` usa los mismos
SettingsView/store/usePublicIdentity, sustituyendo únicamente el proveedor de
identidad con JWT firmados. La fixture se sirve en loopback 3118, permite el
certificado TLS efímero solo en el navegador de prueba, recibe tokens por stdin
y nunca se publica como ruta Next. Comprueba lista/creación/token tardíos, A→B,
logout, expiración, SSE real y revocación de fuentes, sin bearer persistido.

CI conserva los seis gates previos y añade `auth-browser-isolation` al agregador
`ci-required`. El browser local preparado sigue rechazando egress, incluidos
SDKs remotos. Esas pruebas no ejercen el Account Portal/Google reales ni acreditan
hardware físico o un despliegue público creado.

Fuentes oficiales consultadas el 2026-10-02:
[verificación JWT](https://clerk.com/docs/guides/sessions/manual-jwt-verification),
[Go Sessions API](https://github.com/clerk/clerk-sdk-go/blob/v2/session/client.go),
[useAuth/getToken](https://clerk.com/docs/nextjs/reference/hooks/use-auth),
[token de sesión](https://clerk.com/docs/guides/sessions/customize-session-tokens),
[Google](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).
