export type ConnectionState =
  | "simulated"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type TelemetrySample = {
  timestamp: string;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_roll: number;
  gyro_pitch: number;
  gyro_yaw: number;
  gps_lat: number;
  gps_lon: number;
  gps_alt: number;
  uv_index: number;
  temperature: number;
  humidity: number;
};
