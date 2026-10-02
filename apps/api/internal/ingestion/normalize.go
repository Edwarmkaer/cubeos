package ingestion

import (
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"math/big"
)

var missionStates = []string{"BOOT", "SAFE", "ARMED", "RELEASED", "DESCENT", "LANDED", "ERROR"}
var deploymentStates = []string{"SAFE", "ARMED", "TRIGGERED", "CONFIRMED", "FAULT"}
var errorBits = []string{"GPS_UNAVAILABLE", "SENSOR_FAILURE", "BATTERY_LOW", "STORAGE_FAILURE", "CAMERA_FAILURE", "RADIO_FAILURE"}
var eventBits = []string{"DEPLOYMENT_ARMED", "DEPLOYMENT_TRIGGERED"}

func integer(p Payload, k string) int64 { v, _ := p[k].(json.Number).Int64(); return v }

type conversion struct {
	key, field string
	divisor    float64
}

var sensorConversions = map[string][]conversion{
	"bme680": {{"t1", "temperatureC", 100}, {"rh", "relativeHumidityPct", 100}, {"p1", "pressurePa", 1}, {"gr", "gasResistanceOhm", 1}},
	"bmp280": {{"t2", "temperatureC", 100}, {"p2", "pressurePa", 1}}, "tmp102": {{"ti", "temperatureC", 100}},
	"bh1750": {{"lx", "illuminanceLux", 1}}, "guvaS12sd": {{"uvr", "adcRaw", 1}, {"uvm", "sensorMv", 1}},
	"gps": {{"la", "latitudeDeg", 1e7}, {"lo", "longitudeDeg", 1e7}, {"al", "altitudeM", 100}, {"sp", "speedMps", 100}, {"hd", "headingDeg", 100}, {"fx", "fix", 1}, {"sa", "satellites", 1}},
}

func convert(p Payload, cs []conversion) telemetry.Object {
	o := telemetry.Object{}
	for _, c := range cs {
		if v, ok := p[c.key]; ok {
			if c.divisor == 1 {
				o[c.field] = v
			} else {
				n, _ := new(big.Rat).SetString(string(v.(json.Number)))
				n.Quo(n, big.NewRat(int64(c.divisor), 1))
				digits := 0
				for d := int64(c.divisor); d > 1; d /= 10 {
					digits++
				}
				o[c.field] = json.Number(n.FloatString(digits))
			}
		}
	}
	return o
}

// Normalize requires a validated Payload. Presence, not message type, controls
// conversions, including individual axes and partial GPS outside G.
func Normalize(p Payload) telemetry.Patch {
	flags := integer(p, "fl")
	errs := []string{}
	events := []string{}
	for b, v := range errorBits {
		if flags&(1<<b) != 0 {
			errs = append(errs, v)
		}
	}
	for b, v := range eventBits {
		if flags&(1<<(b+6)) != 0 {
			events = append(events, v)
		}
	}
	sensors := telemetry.Object{}
	result := telemetry.Patch{"messageType": p["m"], "deviceId": p["id"], "sequence": p["n"], "deviceTime": telemetry.Object{"unixUtc": p["t"], "uptimeMs": p["u"], "utcValid": p["t"] != json.Number("0")}, "missionState": missionStates[integer(p, "st")], "health": telemetry.Object{"flags": p["fl"], "errors": errs, "events": events}, "sensors": sensors}
	for sensor, cs := range sensorConversions {
		o := convert(p, cs)
		if len(o) > 0 {
			if sensor == "guvaS12sd" {
				o["uvIndex"] = nil
			}
			sensors[sensor] = o
		}
	}
	imu := telemetry.Object{}
	for vector, cs := range map[string][]conversion{"accelerationG": {{"ax", "x", 1000}, {"ay", "y", 1000}, {"az", "z", 1000}}, "angularRateDps": {{"gx", "x", 1000}, {"gy", "y", 1000}, {"gz", "z", 1000}}} {
		if o := convert(p, cs); len(o) > 0 {
			imu[vector] = o
		}
	}
	if len(imu) > 0 {
		sensors["mpu6050"] = imu
	}
	if power := convert(p, []conversion{{"bv", "batteryVoltageV", 1000}, {"bi", "batteryCurrentA", 1000}, {"bp", "batteryPowerW", 1000}}); len(power) > 0 {
		result["power"] = power
	}
	payload := telemetry.Object{}
	if _, ok := p["cam"]; ok {
		payload["cameraOk"] = integer(p, "cam") == 1
	}
	if v, ok := p["sd"]; ok {
		payload["sdFreeMb"] = v
	}
	if _, ok := p["dp"]; ok {
		payload["deploymentState"] = deploymentStates[integer(p, "dp")]
	}
	if len(payload) > 0 {
		result["payload"] = payload
	}
	return result
}
