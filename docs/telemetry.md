# Telemetría

Estado: contrato legacy implementado por el simulador de frontend. No describe las lecturas reales de hardware v2. La migración, unidades, historial para análisis y estados ausentes están definidos en [el diseño vigente](superpowers/specs/2026-10-01-cubeos-backend-design.md); el PR de contratos conservará los payloads originales entregados y formalizará el snapshot.

Contrato confirmado para la interfaz. Una Muestra llega a 2 Hz. Estos doce campos están respaldados a la vez por el esquema SQLite previsto, el store del frontend y los componentes del Visor.

Los nombres van en `snake_case`.

## Campos

| Grupo | Campo | Unidad | Rango o referencia | Uso en el Visor |
| --- | --- | --- | --- | --- |
| Tiempo | `timestamp` | ISO 8601 UTC | Obligatorio | Cabecera e historial |
| Acelerómetro | `accel_x`, `accel_y` | m/s² | -2 a 2 | Tarjeta y gráfica |
| Acelerómetro | `accel_z` | m/s² | 8 a 12 | Tarjeta y gráfica |
| Orientación | `gyro_roll` | ° | -180 a 180 | Visor 3D, tarjeta y gráfica |
| Orientación | `gyro_pitch` | ° | -90 a 90 | Visor 3D, tarjeta y gráfica |
| Orientación | `gyro_yaw` | ° | 0 a 360 | Visor 3D, tarjeta y gráfica |
| GPS | `gps_lat` | grados decimales | -90 a 90 | Mapa |
| GPS | `gps_lon` | grados decimales | -180 a 180 | Mapa |
| GPS | `gps_alt` | km | 380 a 420 | Tarjeta y mapa |
| Ambiente | `uv_index` | índice UV | 0 a 11 | Tarjeta |
| Ambiente | `temperature` | °C | -20 a 60 | Tarjeta y gráfica |
| Ambiente | `humidity` | % RH | 0 a 100 | Tarjeta |

## Forma de una Muestra

```json
{
  "timestamp": "2026-08-03T12:00:00Z",
  "accel_x": 0.1,
  "accel_y": -0.2,
  "accel_z": 9.8,
  "gyro_roll": 12.4,
  "gyro_pitch": -4.1,
  "gyro_yaw": 248.7,
  "gps_lat": -12.046,
  "gps_lon": -77.043,
  "gps_alt": 408.0,
  "uv_index": 5.5,
  "temperature": 22.0,
  "humidity": 45.0
}
```

El ejemplo es representativo de la simulación del Sprint 1; no es una lectura de hardware.

## Simulación inicial

| Señal | Valor base | Variación por muestra |
| --- | --- | --- |
| `gps_lat` | -12.046 | ±0.001° |
| `gps_lon` | -77.043 | ±0.001° |
| `gps_alt` | 408 km | ±0.1 km |
| `temperature` | 22 °C | ±0.3 °C |
| `humidity` | 45 % | ±0.5 % |
| `uv_index` | 5.5 | ±0.1 |

La simulación varía de forma suave para no confundirse con ruido o fallo de sensor.

## Persistencia prevista (Sprint 2)

Tabla `sensor_data` en SQLite. Decisión en [docs/adr/0002-sqlite-telemetry.md](adr/0002-sqlite-telemetry.md).

```sql
CREATE TABLE sensor_data (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL,
    accel_x     REAL, accel_y REAL, accel_z REAL,
    gyro_roll   REAL, gyro_pitch REAL, gyro_yaw REAL,
    gps_lat     REAL, gps_lon REAL, gps_alt REAL,
    uv_index    REAL, temperature REAL, humidity REAL
);

CREATE INDEX idx_timestamp ON sensor_data(timestamp);
```

## Fuera de este contrato

El catálogo de sensores y los wireframes mencionan `pressure` (hPa), `luz` (lux), baterías y cámara. No forman parte de la Muestra confirmada. Ver D-001 y D-005 en [docs/open-questions.md](open-questions.md).
