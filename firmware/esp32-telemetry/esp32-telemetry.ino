// CubeOS — telemetría de ejemplo para ESP32 (probado en ESP32-C3 SuperMini).
//
// Envía una línea JSON por lectura a 115200 baudios, lista para /conectar.
// Sin sensores emite datos sintéticos. Con un MPU6050 en I2C (SDA/SCL abajo)
// calcula roll y pitch reales desde el acelerómetro y manda la temperatura del chip.
//
// ESP32-C3: en Arduino IDE activa "USB CDC On Boot: Enabled" para usar el USB nativo.

#include <Wire.h>

#define BAUD 115200
#define PERIOD_MS 250   // 4 Hz
#define SDA_PIN 8
#define SCL_PIN 9
#define MPU_ADDR 0x68

bool mpuFound = false;
uint32_t seq = 0;

bool mpuBegin() {
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);  // PWR_MGMT_1: salir de reposo
  Wire.write(0x00);
  return Wire.endTransmission() == 0;
}

bool mpuRead(float &ax, float &ay, float &az, float &gx, float &gy, float &gz, float &tempC) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 14) != 14) return false;
  int16_t raw[7];
  for (int i = 0; i < 7; i++) raw[i] = (Wire.read() << 8) | Wire.read();
  ax = raw[0] / 16384.0; ay = raw[1] / 16384.0; az = raw[2] / 16384.0;  // g (±2 g)
  tempC = raw[3] / 340.0 + 36.53;
  gx = raw[4] / 131.0; gy = raw[5] / 131.0; gz = raw[6] / 131.0;       // °/s (±250)
  return true;
}

void setup() {
  Serial.begin(BAUD);
  delay(500);
  mpuFound = mpuBegin();
  Serial.println(mpuFound ? "# CubeOS: MPU6050 detectado" : "# CubeOS: sin MPU6050, datos sinteticos");
}

void loop() {
  static uint32_t last = 0;
  static float yaw = 0;
  if (millis() - last < PERIOD_MS) return;
  float dt = (millis() - last) / 1000.0;
  last = millis();
  seq++;

  float ax, ay, az, gx, gy, gz, temp;
  if (mpuFound && mpuRead(ax, ay, az, gx, gy, gz, temp)) {
    float roll = atan2(ay, az) * 180.0 / PI;
    float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
    yaw = fmod(yaw + gz * dt + 360.0, 360.0);  // integra el giro: deriva con el tiempo
    Serial.printf("{\"seq\":%lu,\"temp\":%.2f,\"roll\":%.1f,\"pitch\":%.1f,\"yaw\":%.1f,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f}\n",
                  (unsigned long)seq, temp, roll, pitch, yaw, ax, ay, az);
  } else {
    float t = millis() / 1000.0;
    Serial.printf("{\"seq\":%lu,\"temp\":%.2f,\"hum\":%.1f,\"roll\":%.1f,\"pitch\":%.1f,\"yaw\":%.1f,\"lat\":%.5f,\"lon\":%.5f}\n",
                  (unsigned long)seq, 22.0 + sin(t / 20.0) * 2.0, 45.0 + sin(t / 30.0) * 5.0,
                  sin(t / 4.0) * 30.0, cos(t / 5.0) * 15.0, fmod(t * 10.0, 360.0),
                  -12.04600 + sin(t / 60.0) * 0.002, -77.04300 + cos(t / 60.0) * 0.002);
  }
}
