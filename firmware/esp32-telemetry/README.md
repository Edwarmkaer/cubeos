# Firmware de ejemplo — ESP32

Envía telemetría por USB en líneas JSON para probar CubeOS de punta a punta.

> Estado: sin compilar ni probar en una placa física (no se pudo descargar el toolchain). Si falla al compilar, ábrelo como issue o corrígelo en el IDE.

- Sin sensores: datos sintéticos (temperatura, humedad, orientación, GPS).
- Con MPU6050 en I2C (SDA 8, SCL 9 en la ESP32-C3 SuperMini): roll y pitch
  reales del acelerómetro, yaw integrado del giroscopio (deriva) y temperatura del chip.

## Cargar

Arduino IDE con el core `esp32` de Espressif:

1. Placa: *ESP32C3 Dev Module*. Activa **USB CDC On Boot: Enabled**.
2. Abre `esp32-telemetry.ino` y súbelo.

Con arduino-cli:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc firmware/esp32-telemetry
arduino-cli upload -p /dev/ttyACM0 --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc firmware/esp32-telemetry
```

Para otra placa ESP32 cambia `SDA_PIN`/`SCL_PIN` y el FQBN.

## Conectar

1. Abre CubeOS en Chrome o Edge → **Conectar** → **USB serial**, 115200 baudios.
2. **Elegir puerto y conectar**. Los campos aparecen solos.
3. Opcional: **Importar** `esp32-telemetry.cubeos.json` para nombres y unidades listos.

En Linux, si el puerto no abre, añade tu usuario al grupo `dialout` y vuelve a iniciar sesión.

## Formato

Una lectura por línea. Las líneas que empiezan con `#` son comentarios y se ignoran.

```json
{"seq":12,"temp":22.41,"roll":3.2,"pitch":-1.0,"yaw":120.0}
```
