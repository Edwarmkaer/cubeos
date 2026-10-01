import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import uplinkSchema from "../schemas/uplink-v2.json" with { type: "json" };
import snapshotSchema from "../schemas/snapshot-v2.json" with { type: "json" };
import envelopeSchema from "../schemas/received-envelope-v1.json" with { type: "json" };
import type { SnapshotV2, ReceivedEnvelopeV1, NormalizedUplinkV2, MissionState, DeploymentState, HealthError, DeploymentEvent } from "./types.ts";
export type * from "./types.ts";

export type MessageType = "H" | "E" | "O" | "I" | "G";
type Common = {
  v: 2; id: string; n: number; u: number; t: number; st: 0 | 1 | 2 | 3 | 4 | 5 | 6; fl: number;
};
// The delivered schema permits known fields on any message; only requirements vary by m.
type Measurements = Partial<Record<
  "bv" | "bi" | "bp" | "cam" | "sd" | "dp" | "t1" | "rh" | "p1" | "gr" |
  "t2" | "p2" | "ti" | "lx" | "uvr" | "uvm" | "ax" | "ay" | "az" |
  "gx" | "gy" | "gz" | "la" | "lo" | "al" | "sp" | "hd" | "fx" | "sa", number>>;
type RequiredFields<K extends keyof Measurements> = Required<Pick<Measurements, K>>;
export type UplinkV2 = Common & Measurements & (
  | ({ m: "H" } & RequiredFields<"cam" | "sd" | "dp">)
  | ({ m: "E" } & RequiredFields<"t1" | "rh" | "p1" | "gr">)
  | ({ m: "O" } & RequiredFields<"lx" | "uvr" | "uvm">)
  | ({ m: "I" } & RequiredFields<"ax" | "ay" | "az" | "gx" | "gy" | "gz">)
  | ({ m: "G" } & RequiredFields<"la" | "lo" | "al" | "sp" | "hd" | "fx" | "sa">)
);

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
/** Pure validation: no coercion, default insertion or removal of payload fields. */
export const validateUplinkV2 = ajv.compile<UplinkV2>(uplinkSchema);

export const validateSnapshotV2 = ajv.compile<SnapshotV2>(snapshotSchema);
export const validateReceivedEnvelopeV1 = ajv.compile<ReceivedEnvelopeV1>(envelopeSchema);

const missionStates: MissionState[] = ["BOOT", "SAFE", "ARMED", "RELEASED", "DESCENT", "LANDED", "ERROR"];
const deploymentStates: DeploymentState[] = ["SAFE", "ARMED", "TRIGGERED", "CONFIRMED", "FAULT"];
const errorBits: HealthError[] = ["GPS_UNAVAILABLE", "SENSOR_FAILURE", "BATTERY_LOW", "STORAGE_FAILURE", "CAMERA_FAILURE", "RADIO_FAILURE"];
const eventBits: DeploymentEvent[] = ["DEPLOYMENT_ARMED", "DEPLOYMENT_TRIGGERED"];

/** Reference conversion for cross-language fixtures. Does not project state or assign server time. */
export function normalizeUplinkV2(value: unknown): NormalizedUplinkV2 {
  if (!validateUplinkV2(value)) throw new Error(`Invalid uplink v2: ${ajv.errorsText(validateUplinkV2.errors)}`);
  const p = value;
  const result: NormalizedUplinkV2 = {
    messageType: p.m, deviceId: p.id, sequence: p.n,
    deviceTime: { unixUtc: p.t, uptimeMs: p.u, utcValid: p.t !== 0 },
    missionState: missionStates[p.st],
    health: { flags: p.fl, errors: errorBits.filter((_, bit) => (p.fl & (1 << bit)) !== 0), events: eventBits.filter((_, bit) => (p.fl & (1 << (bit + 6))) !== 0) },
    sensors: {},
  };
  // Include only measured fields: missing is never replaced with zero.
  if (p.t1 !== undefined || p.rh !== undefined || p.p1 !== undefined || p.gr !== undefined) {
    result.sensors.bme680 = {
      ...(p.t1 !== undefined && { temperatureC: p.t1 / 100 }),
      ...(p.rh !== undefined && { relativeHumidityPct: p.rh / 100 }),
      ...(p.p1 !== undefined && { pressurePa: p.p1 }),
      ...(p.gr !== undefined && { gasResistanceOhm: p.gr }),
    };
  }
  if (p.t2 !== undefined || p.p2 !== undefined) result.sensors.bmp280 = { ...(p.t2 !== undefined && { temperatureC: p.t2 / 100 }), ...(p.p2 !== undefined && { pressurePa: p.p2 }) };
  if (p.ti !== undefined) result.sensors.tmp102 = { temperatureC: p.ti / 100 };
  if (p.lx !== undefined) result.sensors.bh1750 = { illuminanceLux: p.lx };
  if (p.uvr !== undefined || p.uvm !== undefined) result.sensors.guvaS12sd = { ...(p.uvr !== undefined && { adcRaw: p.uvr }), ...(p.uvm !== undefined && { sensorMv: p.uvm }), uvIndex: null };
  if (p.ax !== undefined && p.ay !== undefined && p.az !== undefined) result.sensors.mpu6050 = { accelerationG: { x: p.ax / 1000, y: p.ay / 1000, z: p.az / 1000 } };
  if (p.gx !== undefined && p.gy !== undefined && p.gz !== undefined) result.sensors.mpu6050 = { ...result.sensors.mpu6050, angularRateDps: { x: p.gx / 1000, y: p.gy / 1000, z: p.gz / 1000 } };
  if (p.m === "G") result.sensors.gps = { latitudeDeg: p.la / 1e7, longitudeDeg: p.lo / 1e7, altitudeM: p.al / 100, speedMps: p.sp / 100, headingDeg: p.hd / 100, fix: p.fx, satellites: p.sa };
  if (p.bv !== undefined || p.bi !== undefined || p.bp !== undefined) result.power = {
    ...(p.bv !== undefined && { batteryVoltageV: p.bv / 1000 }),
    ...(p.bi !== undefined && { batteryCurrentA: p.bi / 1000 }),
    ...(p.bp !== undefined && { batteryPowerW: p.bp / 1000 }),
  };
  if (p.cam !== undefined || p.sd !== undefined || p.dp !== undefined) result.payload = {
    ...(p.cam !== undefined && { cameraOk: p.cam === 1 }),
    ...(p.sd !== undefined && { sdFreeMb: p.sd }),
    ...(p.dp !== undefined && { deploymentState: deploymentStates[p.dp] }),
  };
  return result;
}
