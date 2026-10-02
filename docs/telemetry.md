# Telemetría

Estado 2026-10-01: contratos Chasqui v2 y simulador reproducible en
`packages/contracts` y `tools/simulator`. Web todavía consume la demo legacy de
`packages/telemetry`; su migración corresponde al PR7 del
[plan](superpowers/plans/2026-10-01-cubeos-backend.md). PR3 implementó identidad y
dispositivos; PR4 implementa validación/normalización Go, recepciones e historial
PostgreSQL, proyección reconstruible y lecturas REST/CSV con propiedad. Los
adaptadores serial/HTTP pertenecen a PR5. Arquitectura: [ADR 0005](adr/0005-backend-local-cloud-media.md).

## Trama compacta de hardware v2

Autoridad: [esquema original](../packages/contracts/schemas/uplink-v2.json),
preservado byte a byte, con [procedencia y checksums](../packages/contracts/fixtures/chasqui-v2/PROVENANCE.md).
Campos comunes obligatorios: `v=2`, `id` de vuelo, `m`, secuencia uint32 `n`,
encendido uint32 `u` en ms, UTC Unix `t` en s, estado `st` y bitmask `fl`.
`t=0` significa UTC no válida; `receivedAt` lo asigna PostgreSQL con reloj del
servidor después de adquirir el lock del dispositivo.

| Tipo | Campos obligatorios específicos | Cadencia inicial de prueba |
| --- | --- | --- |
| H | `cam`, `sd`, `dp` | 1 Hz |
| E | `t1`, `rh`, `p1`, `gr` | 1 Hz |
| O | `lx`, `uvr`, `uvm` | 1 Hz |
| I | `ax`, `ay`, `az`, `gx`, `gy`, `gz` | 2 Hz |
| G | `la`, `lo`, `al`, `sp`, `hd`, `fx`, `sa` | 0.5 Hz, opcional |

`bv/bi/bp`, `t2/p2/ti` son opcionales. El esquema admite cualquier clave conocida
en cualquier tipo, aunque los requisitos varían por `m`; no se endurece esa
regla. Versión anterior, claves desconocidas, tipos/rangos incorrectos y campos
obligatorios ausentes se rechazan. Ausencia opcional y medición cero se distinguen.

## Conversiones legibles

Los [fixtures compartidos](../packages/contracts/fixtures/chasqui-v2/normalization-cases.json)
son el oráculo para TypeScript y Go. `normalizeUplinkV2` valida antes de convertir
y devuelve un patch por recepción; no reconstruye el estado ni evalúa qué lectura
es válida frente a fallas, atraso o reinicio.

| Entrada | Salida / unidad | Conversión |
| --- | --- | --- |
| `t1`, `t2`, `ti` | temperatura °C de BME680, BMP280 y TMP102 | /100 |
| `rh` | humedad relativa % | /100 |
| `p1`, `p2` | presión Pa | sin cambio |
| `gr` | resistencia de gas Ω | sin cambio; no es concentración |
| `bv`, `bi`, `bp` | voltaje V, corriente A, potencia W | /1000, conservar signo |
| `lx` | iluminancia lux | sin cambio |
| `uvr`, `uvm` | cuentas ADC, mV | sin cambio; `uvIndex=null` |
| `ax`, `ay`, `az` | aceleración g | /1000 |
| `gx`, `gy`, `gz` | velocidad angular grados/s | /1000; no Euler |
| `la`, `lo` | latitud/longitud grados | /10⁷ |
| `al`, `sp`, `hd` | altitud m, velocidad m/s, rumbo grados | /100 |
| `fx`, `sa` | fix y satélites | sin cambio |
| `cam`, `sd`, `dp` | cámara bool, almacenamiento MB, despliegue | 0/1→bool, sin cambio, enum |

Casos de referencia: `t1=2465 → 24.65 °C`, `gz=18 → 0.018 grados/s`,
`al=81240 → 812.4 m`. No se deriva índice UV sin calibración, orientación a partir
de velocidades angulares ni porcentaje de batería sin modelo aprobado. No hay
medición independiente de Paneles. G no se emite por defecto en el simulador;
no se presume GPS instalado por ausencia. El proyector acepta posición solo con
latitud, longitud y `fx=2/3` presentes en la misma recepción, aun fuera de G.
Conserva calidad `fx/sa` medida, pero `fx=0` expresa indisponibilidad y `fx=1` o
coordenadas parciales expresan incertidumbre; no refrescan posición utilizable.

`st`: 0 BOOT, 1 SAFE, 2 ARMED, 3 RELEASED, 4 DESCENT, 5 LANDED, 6 ERROR.
`dp`: 0 SAFE, 1 ARMED, 2 TRIGGERED, 3 CONFIRMED, 4 FAULT.

| Bit `fl` | Etiqueta legible | Clase |
| --- | --- | --- |
| 0 | GPS_UNAVAILABLE | falla |
| 1 | SENSOR_FAILURE | falla global, no identifica un sensor |
| 2 | BATTERY_LOW | falla |
| 3 | STORAGE_FAILURE | falla |
| 4 | CAMERA_FAILURE | falla |
| 5 | RADIO_FAILURE | falla |
| 6 | DEPLOYMENT_ARMED | evento |
| 7 | DEPLOYMENT_TRIGGERED | evento |

La normalización conserva `flags` completos; separa `errors` de `events`.

## Snapshot y recepción

El [ejemplo original](../packages/contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json)
es evidencia de forma, no un esquema de todos los estados. CubeOS formaliza
[snapshot-v2.json](../packages/contracts/schemas/snapshot-v2.json) compatible con
`schemaVersion="2.0"` y sus nombres originales. Lecturas desconocidas pueden estar
ausentes en sensores opcionales o nulas; energía/GPS ausentes conservan nulos.
`unavailable` permite expresar indisponibilidad; `unverified` conserva incertidumbre.
No se rellenan con ceros, 915 MHz ni `GS01`: esos últimos valores pertenecen al
ejemplo entregado, no son defaults del backend.

El servidor combina la última lectura válida de cada grupo. La forma
`SnapshotProjectionV2` envuelve `snapshot` con revisión monotónica y
`freshnessByGroup`: recepción, secuencia, encendido y `receptionEpoch` por grupo
semántico; `fields` conserva esos metadatos por ruta de campo. Un H con `gx`
refresca ese eje de I, nunca los demás. La cabecera conserva la frontera global;
cada campo se fusiona por su propio orden lógico (época, secuencia y uptime
modular), no por el orden de llegada. La frescura del grupo corresponde a su
campo de mayor orden, aunque otro campo más antiguo haya llegado después; la
fecha de cada campo es la autoridad para su antigüedad de recepción.
No se fija un umbral de obsolescencia ni se promete simultaneidad. Un grupo sin
evidencia no aparece en frescura. La frescura no se inyecta en el snapshot legible.

Fallas mantienen último valor válido y fechas; el bit global SENSOR_FAILURE
impide confiar en nuevas lecturas de sensores sin identificar cuál falló. Solo
sensores previamente disponibles pasan a `unavailable`; desconocidos siguen
`unverified`. GPS/radio usan sus bits específicos. Cámara/SD fallidos conservan
sus valores previos y flags; ausencia no significa cero ni hardware no instalado.
BATTERY_LOW no invalida la medición eléctrica. Después de un reinicio confirmado,
grupos aún no medidos quedan `unverified` con sus valores/fechas anteriores; un
wrap de secuencia conserva esa evidencia sin presumir reinicio. Las lecturas
fallidas, parciales o atrasadas permanecen en el historial normalizado.

`projectionState` conserva `frontierEpoch`, la barrera de último reinicio
`minimumEpoch` y `statusEvidence` por sensor/power/radio. La evidencia de estado
se ordena separada de la última medición válida: un E101 sano puede mejorar un
campo E100 sin quitar una falla I102 posterior. GPS102 con fix válido puede
mejorar la última posición válida GPS100 sin sustituir un `fx=0` de H103 ni
marcar esa posición como actualmente utilizable.

## Orden y evidencia (PR4)

La fuente registrada determina el UUID permitido y su identificador de vuelo;
`CS01` no es globalmente único. Fuente inexistente/revocada, `id` incompatible,
payload inválido y metadatos inválidos conservan recepción con causa. El límite
previo es 8192 bytes: un exceso conserva prefijo, tamaño original, SHA-256 completo
y `rawTruncated=true`, sin almacenar bytes ilimitados. JSON ambiguo con claves
duplicadas se rechaza. Los enteros sin máximo en el esquema se conservan exactos;
se limita expansión numérica a 32768 bits y exponente decimal absoluto a 10000 para evitar consumo
desproporcionado. Es una cuota de recursos de la instalación, no otro campo del
firmware. Raw usa `bytea`, incluso para bytes no UTF-8. No hay purga implícita.

Cada transacción bloquea la fila del dispositivo: validación/normalización,
recepción, identidad lógica, estado de orden y proyección se confirman juntos.
Un fallo DB revierte todo y exige retry; no promete evidencia persistida durante
una caída de almacenamiento. Revisión aumenta una vez por recepción que cambie
la proyección (cabecera, valores, frescura o evidencia de estado), también si
esa recepción está atrasada respecto de la frontera global.
La identidad lógica es `(device, reception_epoch, m, n)`. Igual contenido
canónico conserva nueva recepción duplicada; distinto contenido en la misma
identidad queda rechazado con `sequence_conflict`. No suma muestra ni revisión.

`n/u` usan comparación modular uint32 con media ventana (2³¹). `n` avanzando
por wrap abre época; un atrasado cercano del lado anterior del wrap conserva
la época anterior. Wrap de `u` por sí solo no. Para avanzar, incremento de uptime
debe caber en tiempo de servidor transcurrido +10 s de tolerancia. Retrasados
dentro de 10 s de uptime se guardan como muestras lógicas y pueden actualizar
solo campos/estados cuyo orden supere su evidencia guardada, incluso grupos
ausentes y campos opcionales de otro `m`. E100→I102→E101 produce temperatura de
E101 y frescura E101, conservando `lastSequence`, `deviceTime`, estado, flags y
recepción de cabecera I102. Un atraso sin ningún cambio no suma revisión. Fuera
de esa ventana quedan `ambiguous`, sin atribuirlos a una época de encendido.

Un descenso de uptime **no** prueba reboot. Política conservadora: tras uptime
≥30 s, dos H con BOOT, `n≤16`, `u≤5000`, secuencia/uptime crecientes y separados
≤10 s confirman una época nueva. El primero queda `restart_candidate` rechazado
y trazable; solo el segundo se proyecta. Retransmisión exacta de una época
anterior se reconoce antes de esa heurística y permanece duplicada en su época.
Después de reboot, un paquete antiguo con uptime incompatible no avanza latest.
Sin boot ID hay ambigüedad real: reboots muy cortos, payload idéntico entre boots
o dos BOOT antiguos desconocidos no se identifican perfectamente. No se inventa
esa garantía ni se modifica el uplink. La política prefiere retener evidencia
dudosa a presentar una posición/lectura nueva sin justificación.

El estado de orden y revisión se persiste separado del snapshot. Reconstrucción
local bloquea el mismo dispositivo y reproduce solo decisiones `projected` por
ID de recepción con sus tiempos/metadatos/épocas originales y causa persistida:
`project` permite avanzar cabecera; `late` fusiona solo campos/estados elegibles.
No reevalúa reboot usando el reloj actual ni cambia revisión o fecha de última
mutación. Una época anterior al último reboot no puede revivir campos ausentes.
Caches previas sin `projectionState` reconstruyen esa procedencia desde sus
decisiones persistidas; `rebuild` permite guardarla explícitamente. Historia e
IDs sobreviven reinicios.
Consultas: [OpenAPI](../packages/contracts/openapi/telemetry.yaml) y
[operación API](../apps/api/README.md).

`ReceivedEnvelopeV1` lleva `envelopeVersion=1`, `payload` intacto y `receiver`
opcional con `gatewayId`, `rssiDbm`, `snrDb`, `frequencyMhz`. Su
[esquema](../packages/contracts/schemas/received-envelope-v1.json) rechaza
`sourceId` y `receivedAt` enviados por cliente. La fuente autorizada y el tiempo
de recepción se resuelven en servidor; los metadatos del receptor no conceden
identidad. La ESP32 receptora entrega tramas; LoRa en la documentación original
no impone una dependencia de transporte. Fotos por borde independiente.

## Discrepancias de la entrega

- La guía pide omitir sensores fallidos/no instalados y el esquema requiere
  campos por tipo. Se aplica el esquema intacto y se registra la causa de rechazo;
  el escenario `failures` reproduce una omisión inválida. No se adivina el valor.
- `fx=1` está permitido por el esquema, aunque el diccionario enumera 0/2/3.
  Se acepta sintácticamente; no se infiere calidad de posición de ese dato.
- El inventario menciona `bt`, ausente del esquema. Se rechaza como clave extra.

Confirmaciones pendientes: [decisiones abiertas](open-questions.md).
Política: [ADR 0006](adr/0006-hardware-v2-contracts.md).
Comando y escenarios: [simulador](../tools/simulator/README.md).

## Demo legacy todavía implementada

`packages/telemetry` conserva `Muestra` a 2 Hz y web almacena hasta 60 muestras.
Son datos sintéticos; no equivalen al contrato de hardware.

| Campos legacy | Unidad de la demo |
| --- | --- |
| `timestamp` | ISO 8601 UTC |
| `accel_x`, `accel_y`, `accel_z` | m/s² |
| `gyro_roll`, `gyro_pitch`, `gyro_yaw` | ángulos ° sintéticos |
| `gps_lat`, `gps_lon` | grados |
| `gps_alt` | km sintéticos |
| `uv_index` | índice sintético |
| `temperature` | °C |
| `humidity` | % RH |

El historial breve del store sirve a gráficas; la arquitectura objetivo usa
PostgreSQL para historial persistente, no la tabla SQLite del plan sustituido.
