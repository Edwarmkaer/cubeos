package telemetry

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"
)

type column struct{ title, path string }

var csvColumns = map[string][]column{
	"H": {{"battery_voltage_V", "power.batteryVoltageV"}, {"battery_current_A", "power.batteryCurrentA"}, {"battery_power_W", "power.batteryPowerW"}, {"camera_ok", "payload.cameraOk"}, {"sd_free_MB", "payload.sdFreeMb"}, {"deployment_state", "payload.deploymentState"}},
	"E": {{"bme680_temperature_C", "sensors.bme680.temperatureC"}, {"bme680_relative_humidity_pct", "sensors.bme680.relativeHumidityPct"}, {"bme680_pressure_Pa", "sensors.bme680.pressurePa"}, {"bme680_gas_resistance_ohm", "sensors.bme680.gasResistanceOhm"}, {"bmp280_temperature_C", "sensors.bmp280.temperatureC"}, {"bmp280_pressure_Pa", "sensors.bmp280.pressurePa"}, {"tmp102_temperature_C", "sensors.tmp102.temperatureC"}},
	"O": {{"illuminance_lux", "sensors.bh1750.illuminanceLux"}, {"uv_adc_raw", "sensors.guvaS12sd.adcRaw"}, {"uv_sensor_mV", "sensors.guvaS12sd.sensorMv"}},
	"I": {{"acceleration_x_g", "sensors.mpu6050.accelerationG.x"}, {"acceleration_y_g", "sensors.mpu6050.accelerationG.y"}, {"acceleration_z_g", "sensors.mpu6050.accelerationG.z"}, {"angular_rate_x_deg_s", "sensors.mpu6050.angularRateDps.x"}, {"angular_rate_y_deg_s", "sensors.mpu6050.angularRateDps.y"}, {"angular_rate_z_deg_s", "sensors.mpu6050.angularRateDps.z"}},
	"G": {{"latitude_deg", "sensors.gps.latitudeDeg"}, {"longitude_deg", "sensors.gps.longitudeDeg"}, {"altitude_m", "sensors.gps.altitudeM"}, {"speed_m_s", "sensors.gps.speedMps"}, {"heading_deg", "sensors.gps.headingDeg"}, {"fix", "sensors.gps.fix"}, {"satellites", "sensors.gps.satellites"}},
}

func field(p Patch, path string) string {
	var value any = Object(p)
	for _, key := range strings.Split(path, ".") {
		o, ok := value.(Object)
		if !ok {
			return ""
		}
		value = o[key]
	}
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

// WriteCSV exports logical samples from a bounded history page. CSV values come
// from each reception's patch, never from a combined snapshot. Missing is blank.
func WriteCSV(ctx context.Context, w io.Writer, group string, packets []Packet) error {
	columns, ok := csvColumns[group]
	if !ok {
		return ErrQuery
	}
	if len(packets) > 200 {
		return ErrQuery
	}
	csvWriter := csv.NewWriter(w)
	header := []string{"reception_id", "received_at_UTC", "reception_epoch", "sequence", "uptime_ms", "flags"}
	for _, c := range columns {
		header = append(header, c.title)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := csvWriter.Write(header); err != nil {
		return err
	}
	for _, p := range packets {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !p.Logical || p.Group == nil || *p.Group != group {
			continue
		}
		row := []string{fmt.Sprint(p.ID), p.ReceivedAt.UTC().Format(time.RFC3339Nano), fmt.Sprint(*p.Epoch), fmt.Sprint(*p.Sequence), fmt.Sprint(*p.Uptime), field(p.Normalized, "health.flags")}
		for _, c := range columns {
			row = append(row, field(p.Normalized, c.path))
		}
		if err := csvWriter.Write(row); err != nil {
			return err
		}
		csvWriter.Flush()
		if err := csvWriter.Error(); err != nil {
			return err
		}
	}
	csvWriter.Flush()
	return csvWriter.Error()
}
