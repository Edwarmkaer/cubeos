# Telemetría

Estado 2026-10-01: contratos Chasqui v2 y simulador reproducible en
`packages/contracts` y `tools/simulator`. Web todavía consume la demo legacy de
`packages/telemetry`; su migración corresponde al PR7 del
[plan](superpowers/plans/2026-10-01-cubeos-backend.md). Backend y persistencia aún
no están implementados. Arquitectura objetivo: [ADR 0005](adr/0005-backend-local-cloud-media.md).

## Trama compacta de hardware v2

Autoridad: [esquema original](../packages/contracts/schemas/uplink-v2.json),
preservado byte a byte, con [procedencia y checksums](../packages/contracts/fixtures/chasqui-v2/PROVENANCE.md).
Campos comunes obligatorios: `v=2`, `id` de vuelo, `m`, secuencia uint32 `n`,
encendido uint32 `u` en ms, UTC Unix `t` en s, estado `st` y bitmask `fl`.
`t=0` significa UTC no válida; `receivedAt` lo asignará el servidor.

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
no se presume GPS instalado hasta recibir y evaluar un G válido. Un G sin fix
no prueba posición utilizable: esa decisión de calidad será del proyector Go.

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

El servidor futuro combinará la última lectura válida de cada grupo. La forma
`SnapshotProjectionV2` envuelve `snapshot` con revisión monotónica y
`freshnessByGroup`: recepción, secuencia y encendido por tipo. La frescura no se
inyecta en el snapshot legible; grupos de distintas edades no son simultáneos.
Validez semántica, discontinuidades, wrap, conflictos y persistencia pertenecen
al PR4 conforme al [modelo](domain-model.md).

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
