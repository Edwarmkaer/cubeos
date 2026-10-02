import type { MessageType } from "./index.ts";

export type MissionState = "BOOT" | "SAFE" | "ARMED" | "RELEASED" | "DESCENT" | "LANDED" | "ERROR";
export type DeploymentState = "SAFE" | "ARMED" | "TRIGGERED" | "CONFIRMED" | "FAULT";
export type HealthError = "GPS_UNAVAILABLE" | "SENSOR_FAILURE" | "BATTERY_LOW" | "STORAGE_FAILURE" | "CAMERA_FAILURE" | "RADIO_FAILURE";
export type DeploymentEvent = "DEPLOYMENT_ARMED" | "DEPLOYMENT_TRIGGERED";
export type SensorStatus = "available" | "optional_backup" | "unverified" | "not_installed" | "unavailable";
type Vector = { x: number | null; y: number | null; z: number | null };
export type SensorReadings = {
  bme680: { temperatureC?: number | null; relativeHumidityPct?: number | null; pressurePa?: number | null; gasResistanceOhm?: number | null };
  bmp280: { temperatureC?: number | null; pressurePa?: number | null };
  tmp102: { temperatureC?: number | null };
  bh1750: { illuminanceLux?: number | null };
  guvaS12sd: { adcRaw?: number | null; sensorMv?: number | null; uvIndex: null };
  mpu6050: { accelerationG?: Vector | null; angularRateDps?: Vector | null };
  gps: { latitudeDeg: number | null; longitudeDeg: number | null; altitudeM: number | null; speedMps: number | null; headingDeg: number | null; fix: number | null; satellites: number | null };
};
export type DeviceTime = { unixUtc: number; uptimeMs: number; utcValid: boolean };
export type PowerReadings = { batteryVoltageV: number | null; batteryCurrentA: number | null; batteryPowerW: number | null };
export type PayloadState = { cameraOk: boolean | null; sdFreeMb: number | null; deploymentState: DeploymentState | null };
export type SnapshotV2 = {
  schemaVersion: "2.0";
  deviceId: string;
  receivedAt: string;
  lastSequence: number;
  deviceTime: DeviceTime;
  missionState: MissionState;
  health: { flags: number; errors: HealthError[]; events?: DeploymentEvent[] };
  sensors: {
    [K in keyof SensorReadings]: SensorReadings[K] & { status:
      K extends "guvaS12sd" ? "available_uncalibrated" | "unverified" | "not_installed" | "unavailable" :
      K extends "gps" ? Exclude<SensorStatus, "optional_backup"> : SensorStatus
    }
  };
  power: PowerReadings & { status: "available" | "monitor_not_installed" | "unverified" | "unavailable" };
  payload: PayloadState;
  radio: { status: "available" | "hardware_not_confirmed" | "unavailable"; rssiDbm: number | null; snrDb: number | null; frequencyMhz: number | null };
  gateway: { id: string | null };
};

export type ReceiverMetadata = { gatewayId?: string; rssiDbm?: number; snrDb?: number; frequencyMhz?: number };
/** Client input: source identity and receivedAt must be assigned by the authenticated server. */
export type ReceivedEnvelopeV1 = { envelopeVersion: 1; payload: import("./index.ts").UplinkV2; receiver?: ReceiverMetadata };
export type FieldFreshness = { receivedAt: string; sequence: number; uptimeMs: number; receptionEpoch: number };
export type GroupFreshness = FieldFreshness & { fields: Record<string, FieldFreshness> };
/** The readable source snapshot stays intact inside the server projection. */
export type SnapshotProjectionV2 = { revision: number; snapshot: SnapshotV2; freshnessByGroup: Partial<Record<MessageType, GroupFreshness>> };

type VectorPatch = Partial<Record<"x" | "y" | "z", number>>;
/** Conversion reference only: not a persisted/combined snapshot or an ordering algorithm. */
export type NormalizedUplinkV2 = {
  messageType: MessageType; deviceId: string; sequence: number;
  deviceTime: DeviceTime; missionState: MissionState;
  health: { flags: number; errors: HealthError[]; events: DeploymentEvent[] };
  sensors: {
    [K in keyof SensorReadings]?: K extends "mpu6050"
      ? { accelerationG?: VectorPatch; angularRateDps?: VectorPatch }
      : Partial<SensorReadings[K]>
  };
  power?: Partial<PowerReadings>;
  payload?: Partial<PayloadState>;
};
