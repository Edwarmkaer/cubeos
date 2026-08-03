# Telemetría y sensores

## Contrato confirmado para la interfaz

La muestra de telemetría se actualiza a 2 Hz. Los siguientes doce campos son los que están respaldados simultáneamente por el esquema de SQLite, el estado frontend y los componentes especificados.

| Grupo | Campo | Unidad | Rango o referencia | Uso en la interfaz |
| --- | --- | --- | --- | --- |
| Tiempo | `timestamp` | ISO 8601 UTC | Obligatorio | Encabezado e historial |
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

## Forma de una muestra

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

El ejemplo es representativo de la simulación prevista para el Sprint 1; no es una lectura real de hardware.

## Simulación inicial

| Señal | Valor base | Variación por muestra |
| --- | --- | --- |
| `gps_lat` | -12.046 | ±0.001° |
| `gps_lon` | -77.043 | ±0.001° |
| `gps_alt` | 408 km | ±0.1 km |
| `temperature` | 22 °C | ±0.3 °C |
| `humidity` | 45 % | ±0.5 % |
| `uv_index` | 5.5 | ±0.1 |

La simulación debe variar de forma suave para distinguirla visualmente de ruido o fallos de sensor.

## Persistencia inicial

La tabla `sensor_data` usa SQLite y contiene el identificador más los doce valores confirmados. La decisión completa se conserva en [ADR-002](../ADR/ADR-002-base-de-datos.md).

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

## Campos aún no integrados

El catálogo de sensores también menciona `pressure` (hPa) y `luz` (lux). Ninguno aparece hoy en la tabla, el estado global ni los componentes definidos. Su incorporación queda bloqueada hasta resolver la decisión correspondiente en [DECISIONES-ABIERTAS.md](../DECISIONES-ABIERTAS.md).
