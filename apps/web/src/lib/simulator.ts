import type { TelemetrySample } from "@cubeos/telemetry";

export const seedSample: TelemetrySample = {
  timestamp: "2026-08-03T12:00:00Z",
  accel_x: 0.1,
  accel_y: -0.2,
  accel_z: 9.8,
  gyro_roll: 12.4,
  gyro_pitch: -4.1,
  gyro_yaw: 248.7,
  gps_lat: -12.046,
  gps_lon: -77.043,
  gps_alt: 408.0,
  uv_index: 5.5,
  temperature: 22.0,
  humidity: 45.0,
};

function walk(value: number, step: number, min: number, max: number) {
  const next = value + (Math.random() * 2 - 1) * step;
  return Math.min(max, Math.max(min, next));
}

export function nextSample(prev: TelemetrySample): TelemetrySample {
  return {
    timestamp: new Date().toISOString(),
    accel_x: walk(prev.accel_x, 0.04, -2, 2),
    accel_y: walk(prev.accel_y, 0.04, -2, 2),
    accel_z: walk(prev.accel_z, 0.05, 8, 12),
    gyro_roll: walk(prev.gyro_roll, 0.8, -180, 180),
    gyro_pitch: walk(prev.gyro_pitch, 0.5, -90, 90),
    gyro_yaw: (walk(prev.gyro_yaw, 1.2, 0, 360) + 360) % 360,
    gps_lat: walk(prev.gps_lat, 0.001, -90, 90),
    gps_lon: walk(prev.gps_lon, 0.001, -180, 180),
    gps_alt: walk(prev.gps_alt, 0.1, 380, 420),
    uv_index: walk(prev.uv_index, 0.1, 0, 11),
    temperature: walk(prev.temperature, 0.3, -20, 60),
    humidity: walk(prev.humidity, 0.5, 0, 100),
  };
}
