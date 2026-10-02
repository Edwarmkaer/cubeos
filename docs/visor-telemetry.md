# Operación del visor v2

El visor empieza en **API local pendiente**, sin dispositivo ni muestra. En
Configuración se elige API local, API pública o **DEMO · datos sintéticos**. La
elección vive en memoria; recargar vuelve al estado pendiente. DEMO conserva el
simulador legacy, ángulos, baterías de prueba y las seis imágenes NASA empaquetadas.
Nunca alimenta la fuente real. `packages/telemetry` sigue teniendo consumidores
en demo/lab y permanece como compatibilidad.

## Fuente y dispositivo

Para API local, indicar su origen loopback completo, por ejemplo
`http://localhost:8080`. Web y API deben usar el mismo hostname (`localhost` o
`127.0.0.1`) y `ALLOWED_ORIGIN` debe coincidir con el origen de web, incluido su
puerto. La API conserva Host/Origin/Sec-Fetch-Site y CORS; no se usa proxy ni se
desactivan protecciones. Configuración consulta dispositivos del perfil local,
permite registrar nombre + identificador de vuelo, renombrar y seleccionar el
UUID propietario devuelto por REST. No se elige automáticamente el primer registro.
Errores se muestran y las operaciones se pueden reintentar.

API pública exige HTTPS y un getter de token de sesión en memoria. La identidad
Clerk corresponde a PR8; sin sesión, la consulta falla antes de contactar al
servidor. No existe token de prueba en producción, fallback local, credencial en
URL ni almacenamiento de bearer. Cambiar el getter invalida la sesión del visor.
Las credenciales de ingestión pertenecen al receptor; no se introducen en web.

El visor hace REST current snapshot y fetch SSE con `@cubeos/api-client`. Al
reconectar recibe el estado actual, sin replay de historia. La revisión decimal
int64 se compara como `BigInt`. La generación del store y AbortSignal cancelan
suscripciones previas; callbacks tardíos no pueden mezclar dispositivo, modo o
identidad. Salir del visor cierra el stream; volver conserva solo su historial
en memoria y reconecta. Cambiar fuente/dispositivo lo vacía inmediatamente.

## Lecturas y evidencia

El contrato/unidades tiene dueño en [telemetría](telemetry.md). El visor muestra
valores normalizados sin volver a convertirlos: giroscopio X/Y/Z en °/s,
aceleración en g, GPS en grados/m/m/s, temperaturas °C, humedad %, presión Pa,
gas Ω, luz lx, UV cuentas y mV, y energía V/A/W. Cero es válido; ausencia permanece
pendiente. No instalado y fallo de sensor son estados distintos. UV no se
convierte a índice; velocidad angular no es orientación. El pozo 3D real muestra
actitud pendiente hasta contar con estimador aprobado.

Cada lectura usa su recibo más reciente en `freshnessByGroup.*.fields`, aunque
el campo haya llegado en otro tipo de trama. El reloj actualiza la edad cada
segundo sin requerir revisión nueva. Más de 10 s se etiqueta **Antigua** como
indicación de presentación, sin afirmar alarma ni umbral de hardware. Si falta
evidencia se indica antigüedad desconocida. Las tendencias guardan hasta 60 puntos
válidos por campo, solo cuando su evidencia avanza; rechazos, duplicados y cambios
de otros campos no agregan ceros ni repiten puntos. Los campos omitidos conservan
su recibo previo y su edad independiente.

GPS acepta coordenadas cero con calidad `fx=2/3`. `fx=0`, `fx=1`, ausencia o fallo
dejan el mapa esperando; `fx=1` dice calidad desconocida. La trayectoria contiene
solo posiciones válidas recientes. Modo sin Internet está activo por defecto en
API local: no inicializa MapLibre ni contacta un proveedor de tiles; conserva
coordenadas textuales y un fallback explícito. Fuentes y assets se sirven desde
la compilación preparada. El modo online conserva MapLibre/OpenFreeMap existente.

La batería real muestra voltaje con aro vacío: porcentaje/SOC requiere D-007.
Paneles permanece sin medición independiente. Cámara muestra estado y espacio SD,
con galería vacía; estado operativo no prueba que exista una captura. Recepción
de fotos corresponde a PR10. Bits de despliegue se muestran como eventos, separados
de errores, según el contrato.

**API conectada** describe exclusivamente navegador→API. **Entrega observada**
y su edad describen datos recibidos por el backend, junto con gateway/RSSI/SNR
cuando existen. No prueban que el enlace radio receptor→CubeSat esté conectado.

## Verificación

`pnpm --filter web test` comprueba lecturas y aislamiento de sesiones; lint,
typecheck y build permanecen obligatorios. `apps/web/tests/browser-integration.mjs`
requiere `CUBEOS_API_BINARY`, `TEST_BROWSER_DATABASE_URL` exclusivo y web preparada
(`CUBEOS_WEB_URL`); arranca su propia API, registra dispositivos/fuente, ejecuta
el simulador CLI por HTTP y verifica REST/SSE en Chromium. Incluye pendiente antes
de ingestión, conversiones, ausencia/falla/fx1/cero, duplicados, reconexión y edad
durante silencio, cambio de dispositivo/modo, identidad pública cerrada, control
por teclado y móvil con desplazamiento horizontal intencional del bento.
El gate local intercepta y falla ante cualquier intento de egress externo.
`browser-live-telemetry` ejecuta este flujo con PostgreSQL exclusivo en CI; no
reemplaza la integración por mocks. `ci-required` exige todos los jobs exitosos.
