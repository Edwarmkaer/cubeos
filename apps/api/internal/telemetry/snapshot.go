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
	State            ProjectionState      `json:"projectionState"`
}

// Status evidence is separate from last valid measurements: a late valid value
// may improve a field while a newer failure still makes its sensor unavailable.
type ProjectionState struct {
	FrontierEpoch  int64                     `json:"frontierEpoch"`
	MinimumEpoch   int64                     `json:"minimumEpoch"`
	StatusEvidence map[string]FieldFreshness `json:"statusEvidence"`
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
func evidence(p Patch, at time.Time, epoch int64) FieldFreshness {
	return FieldFreshness{at.UTC().Format(time.RFC3339Nano), p.Sequence(), p.Uptime(), epoch}
}
func newer(candidate, previous FieldFreshness) bool {
	if previous.ReceivedAt == "" {
		return true
	}
	if candidate.Epoch != previous.Epoch {
		return candidate.Epoch > previous.Epoch
	}
	return forward(candidate.Sequence, previous.Sequence) && (candidate.UptimeMs == previous.UptimeMs || forward(candidate.UptimeMs, previous.UptimeMs))
}
func (s *Projection) refresh(group, path string, candidate FieldFreshness) {
	f := s.FreshnessByGroup[group]
	if newer(candidate, f.FieldFreshness) {
		f.FieldFreshness = candidate
	}
	if f.Fields == nil {
		f.Fields = map[string]FieldFreshness{}
	}
	f.Fields[path] = candidate
	s.FreshnessByGroup[group] = f
}
func (s *Projection) merge(dst, src Object, group, path string, candidate FieldFreshness) bool {
	changed := false
	for k, v := range src {
		if nested, ok := v.(Object); ok {
			target, ok := dst[k].(Object)
			if !ok {
				target = Object{"x": nil, "y": nil, "z": nil}
			}
			if s.merge(target, nested, group, path+k+".", candidate) {
				dst[k] = target
				changed = true
			}
		} else if v != nil && newer(candidate, s.FreshnessByGroup[group].Fields[path+k]) {
			dst[k] = v
			s.refresh(group, path+k, candidate)
			changed = true
		}
	}
	return changed
}
func (s *Projection) status(key string, dst Object, value string, candidate FieldFreshness) bool {
	if !newer(candidate, s.State.StatusEvidence[key]) {
		return false
	}
	dst["status"] = value
	s.State.StatusEvidence[key] = candidate
	return true
}

// Apply updates only the fields actually measured in this ordered reception.
// Failure keeps valid evidence and its timestamps, while status indicates that
// evidence is no longer current. Absence never proves hardware not installed.
func (s *Projection) Apply(p Patch, at time.Time, meta ReceiverMetadata) {
	s.ApplyEpoch(p, at, meta, 0)
}
func (s *Projection) ApplyEpoch(p Patch, at time.Time, meta ReceiverMetadata, epoch int64) {
	s.ApplyReception(p, at, meta, epoch, true)
}

// ApplyReception separates the global frontier from per-field logical order.
// Persist cause/projected alongside the reception so replay uses this same
// decision, without rerunning arrival/restart heuristics against today's clock.
func (s *Projection) ApplyReception(p Patch, at time.Time, meta ReceiverMetadata, epoch int64, advance bool) bool {
	if epoch < s.State.MinimumEpoch {
		return false
	}
	hadSnapshot := s.Snapshot != nil
	if s.Snapshot == nil {
		s.Snapshot = emptySnapshot(p.DeviceID())
		s.FreshnessByGroup = map[string]Freshness{}
	}
	if s.State.StatusEvidence == nil {
		s.State.StatusEvidence = map[string]FieldFreshness{}
	}
	changed := advance
	if advance {
		s.Snapshot["receivedAt"] = at.UTC().Format(time.RFC3339Nano)
		s.Snapshot["lastSequence"] = p["sequence"]
		for _, k := range []string{"deviceTime", "missionState", "health"} {
			s.Snapshot[k] = p[k]
		}
		// This is the persisted frontier decision for a confirmed low BOOT.
		// Sequence wrap alone preserves previous-side measurements and quality.
		if hadSnapshot && epoch > s.State.FrontierEpoch && p.Group() == "H" && p["missionState"] == "BOOT" && p.Sequence() <= 16 && p.Uptime() <= 5000 {
			s.State.MinimumEpoch = epoch
			for _, v := range s.Snapshot["sensors"].(Object) {
				v.(Object)["status"] = "unverified"
			}
			s.Snapshot["power"].(Object)["status"] = "unverified"
		}
		s.State.FrontierEpoch = epoch
	}
	candidate := evidence(p, at, epoch)
	flags := number(p["health"].(Object)["flags"])
	sensors := s.Snapshot["sensors"].(Object)
	group := map[string]string{"bme680": "E", "bmp280": "E", "tmp102": "E", "bh1750": "O", "guvaS12sd": "O", "mpu6050": "I", "gps": "G"}
	if flags&2 != 0 {
		for k, v := range sensors {
			dst := v.(Object)
			if k != "gps" {
				value := "unverified"
				if dst["status"] != "unverified" {
					value = "unavailable"
				}
				changed = s.status("sensors."+k, dst, value, candidate) || changed
			}
		}
	}
	if flags&1 != 0 {
		changed = s.status("sensors.gps", sensors["gps"].(Object), "unavailable", candidate) || changed
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
			changed = s.merge(dst, quality, "G", "sensors.gps.", candidate) || changed
			if flags&1 != 0 || (hasFix && number(fx) == 0) {
				changed = s.status("sensors.gps", dst, "unavailable", candidate) || changed
				continue
			}
			if !hasFix || number(fx) < 2 || !la || !lo {
				changed = s.status("sensors.gps", dst, "unverified", candidate) || changed
				continue
			}
		} else if flags&2 != 0 {
			continue
		}
		changed = s.merge(dst, src, group[k], "sensors."+k+".", candidate) || changed
		value := "available"
		if k == "guvaS12sd" {
			value = "available_uncalibrated"
		}
		changed = s.status("sensors."+k, dst, value, candidate) || changed
	}
	if power, ok := p["power"].(Object); ok {
		changed = s.merge(s.Snapshot["power"].(Object), power, "H", "power.", candidate) || changed
		changed = s.status("power", s.Snapshot["power"].(Object), "available", candidate) || changed
	}
	if payload, ok := p["payload"].(Object); ok {
		valid := Object{}
		for k, v := range payload {
			if k == "cameraOk" && flags&16 != 0 || k == "sdFreeMb" && flags&8 != 0 {
				continue
			}
			valid[k] = v
		}
		changed = s.merge(s.Snapshot["payload"].(Object), valid, "H", "payload.", candidate) || changed
	}
	radio := s.Snapshot["radio"].(Object)
	if flags&32 != 0 {
		changed = s.status("radio", radio, "unavailable", candidate) || changed
	} else if advance && (meta.RSSIDbm != nil || meta.SNRDb != nil || meta.FrequencyMhz != nil) {
		changed = s.status("radio", radio, "available", candidate) || changed
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
	if advance && meta.GatewayID != nil {
		s.Snapshot["gateway"].(Object)["id"] = *meta.GatewayID
	}
	if changed {
		s.Revision++
	}
	return changed
}
