package telemetry

import (
	"encoding/json"
	"math"
	"strings"
	"time"
)

type ReceiverMetadata struct {
	GatewayID    *string  `json:"gatewayId,omitempty"`
	RSSIDbm      *float64 `json:"rssiDbm,omitempty"`
	SNRDb        *float64 `json:"snrDb,omitempty"`
	FrequencyMhz *float64 `json:"frequencyMhz,omitempty"`
}

func (m ReceiverMetadata) Valid() bool {
	if m.GatewayID != nil && (len(*m.GatewayID) < 1 || len(*m.GatewayID) > 128 || strings.ContainsAny(*m.GatewayID, "\x00\r\n")) {
		return false
	}
	for _, p := range []*float64{m.RSSIDbm, m.SNRDb, m.FrequencyMhz} {
		if p != nil && (math.IsNaN(*p) || math.IsInf(*p, 0)) {
			return false
		}
	}
	return (m.RSSIDbm == nil || (*m.RSSIDbm >= -200 && *m.RSSIDbm <= 0)) && (m.SNRDb == nil || (*m.SNRDb >= -100 && *m.SNRDb <= 100)) && (m.FrequencyMhz == nil || (*m.FrequencyMhz > 0 && *m.FrequencyMhz <= 100000))
}

type FieldFreshness struct {
	ReceivedAt string `json:"receivedAt"`
	Sequence   uint32 `json:"sequence"`
	UptimeMs   uint32 `json:"uptimeMs"`
	Epoch      int64  `json:"receptionEpoch"`
}
type Freshness struct {
	FieldFreshness
	Fields map[string]FieldFreshness `json:"fields"`
}
type Projection struct {
	Revision         int64                `json:"revision"`
	Snapshot         Object               `json:"snapshot"`
	FreshnessByGroup map[string]Freshness `json:"freshnessByGroup"`
}

func emptySnapshot(id string) Object {
	sensors := Object{}
	for _, k := range []string{"bme680", "bmp280", "tmp102", "bh1750", "guvaS12sd", "mpu6050", "gps"} {
		sensors[k] = Object{"status": "unverified"}
	}
	sensors["guvaS12sd"].(Object)["uvIndex"] = nil
	for _, k := range []string{"latitudeDeg", "longitudeDeg", "altitudeM", "speedMps", "headingDeg", "fix", "satellites"} {
		sensors["gps"].(Object)[k] = nil
	}
	return Object{"schemaVersion": "2.0", "deviceId": id, "sensors": sensors, "power": Object{"status": "unverified", "batteryVoltageV": nil, "batteryCurrentA": nil, "batteryPowerW": nil}, "payload": Object{"cameraOk": nil, "sdFreeMb": nil, "deploymentState": nil}, "radio": Object{"status": "hardware_not_confirmed", "rssiDbm": nil, "snrDb": nil, "frequencyMhz": nil}, "gateway": Object{"id": nil}}
}
func number(v any) int64 {
	switch n := v.(type) {
	case json.Number:
		i, _ := n.Int64()
		return i
	case float64:
		return int64(n)
	}
	return 0
}
func (s *Projection) refresh(group, path string, p Patch, at time.Time, epoch int64) {
	f := s.FreshnessByGroup[group]
	f.FieldFreshness = FieldFreshness{at.UTC().Format(time.RFC3339Nano), p.Sequence(), p.Uptime(), epoch}
	if f.Fields == nil {
		f.Fields = map[string]FieldFreshness{}
	}
	f.Fields[path] = f.FieldFreshness
	s.FreshnessByGroup[group] = f
}
func (s *Projection) merge(dst, src Object, group, path string, p Patch, at time.Time, epoch int64) {
	for k, v := range src {
		if nested, ok := v.(Object); ok {
			target, ok := dst[k].(Object)
			if !ok {
				target = Object{"x": nil, "y": nil, "z": nil}
				dst[k] = target
			}
			s.merge(target, nested, group, path+k+".", p, at, epoch)
		} else {
			dst[k] = v
			if v != nil {
				s.refresh(group, path+k, p, at, epoch)
			}
		}
	}
}

// Apply updates only the fields actually measured in this ordered reception.
// Failure keeps valid evidence and its timestamps, while status indicates that
// evidence is no longer current. Absence never proves hardware not installed.
func (s *Projection) Apply(p Patch, at time.Time, meta ReceiverMetadata) {
	s.ApplyEpoch(p, at, meta, 0)
}
func (s *Projection) ApplyEpoch(p Patch, at time.Time, meta ReceiverMetadata, epoch int64) {
	if s.Snapshot == nil {
		s.Snapshot = emptySnapshot(p.DeviceID())
		s.FreshnessByGroup = map[string]Freshness{}
	}
	s.Revision++
	s.Snapshot["receivedAt"] = at.UTC().Format(time.RFC3339Nano)
	s.Snapshot["lastSequence"] = p["sequence"]
	for _, k := range []string{"deviceTime", "missionState", "health"} {
		s.Snapshot[k] = p[k]
	}
	flags := number(p["health"].(Object)["flags"])
	sensors := s.Snapshot["sensors"].(Object)
	group := map[string]string{"bme680": "E", "bmp280": "E", "tmp102": "E", "bh1750": "O", "guvaS12sd": "O", "mpu6050": "I", "gps": "G"}
	for k, v := range sensors {
		if f, ok := s.FreshnessByGroup[group[k]]; ok && f.Epoch < epoch {
			v.(Object)["status"] = "unverified"
		}
	}
	if f, ok := s.FreshnessByGroup["H"]; ok && f.Epoch < epoch {
		s.Snapshot["power"].(Object)["status"] = "unverified"
	}
	if flags&2 != 0 {
		for k, v := range sensors {
			dst := v.(Object)
			if k != "gps" && (dst["status"] == "available" || dst["status"] == "available_uncalibrated" || dst["status"] == "optional_backup") {
				dst["status"] = "unavailable"
			}
		}
	}
	if flags&1 != 0 {
		sensors["gps"].(Object)["status"] = "unavailable"
	}
	for k, v := range p["sensors"].(Object) {
		dst := sensors[k].(Object)
		src := v.(Object)
		if k == "gps" {
			// Position needs same-packet coordinates AND a 2D/3D fix, never a
			// partial combination of coordinates/fix from different receptions.
			fx, hasFix := src["fix"]
			_, la := src["latitudeDeg"]
			_, lo := src["longitudeDeg"]
			quality := Object{}
			if hasFix {
				quality["fix"] = fx
			}
			if sa, ok := src["satellites"]; ok {
				quality["satellites"] = sa
			}
			s.merge(dst, quality, "G", "sensors.gps.", p, at, epoch)
			if flags&1 != 0 || (hasFix && number(fx) == 0) {
				dst["status"] = "unavailable"
				continue
			}
			if !hasFix || number(fx) < 2 || !la || !lo {
				dst["status"] = "unverified"
				continue
			}
		} else if flags&2 != 0 {
			continue
		}
		s.merge(dst, src, group[k], "sensors."+k+".", p, at, epoch)
		dst["status"] = "available"
		if k == "guvaS12sd" {
			dst["status"] = "available_uncalibrated"
		}
	}
	if power, ok := p["power"].(Object); ok {
		s.merge(s.Snapshot["power"].(Object), power, "H", "power.", p, at, epoch)
		s.Snapshot["power"].(Object)["status"] = "available"
	}
	if payload, ok := p["payload"].(Object); ok {
		valid := Object{}
		for k, v := range payload {
			if k == "cameraOk" && flags&16 != 0 || k == "sdFreeMb" && flags&8 != 0 {
				continue
			}
			valid[k] = v
		}
		s.merge(s.Snapshot["payload"].(Object), valid, "H", "payload.", p, at, epoch)
	}
	radio := s.Snapshot["radio"].(Object)
	if flags&32 != 0 {
		radio["status"] = "unavailable"
	} else if meta.RSSIDbm != nil || meta.SNRDb != nil || meta.FrequencyMhz != nil {
		radio["status"] = "available"
		if meta.RSSIDbm != nil {
			radio["rssiDbm"] = *meta.RSSIDbm
		}
		if meta.SNRDb != nil {
			radio["snrDb"] = *meta.SNRDb
		}
		if meta.FrequencyMhz != nil {
			radio["frequencyMhz"] = *meta.FrequencyMhz
		}
	}
	if meta.GatewayID != nil {
		s.Snapshot["gateway"].(Object)["id"] = *meta.GatewayID
	}
}
