package telemetry

import (
	"bytes"
	"encoding/json"
)

// Object is a readable contract object, not a raw hardware packet.
type Object map[string]any
type Patch Object

func object(v any) any {
	switch x := v.(type) {
	case map[string]any:
		o := Object{}
		for k, v := range x {
			o[k] = object(v)
		}
		return o
	case []any:
		for i, v := range x {
			x[i] = object(v)
		}
		return x
	default:
		return v
	}
}
func (o *Object) UnmarshalJSON(b []byte) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v map[string]any
	if e := d.Decode(&v); e != nil {
		return e
	}
	*o = object(v).(Object)
	return nil
}
func (p *Patch) UnmarshalJSON(b []byte) error {
	var o Object
	if e := json.Unmarshal(b, &o); e != nil {
		return e
	}
	*p = Patch(o)
	return nil
}
func (p Patch) Sequence() uint32 { n, _ := p["sequence"].(json.Number).Int64(); return uint32(n) }
func (p Patch) Uptime() uint32 {
	n, _ := p["deviceTime"].(Object)["uptimeMs"].(json.Number).Int64()
	return uint32(n)
}
func (p Patch) Group() string    { return p["messageType"].(string) }
func (p Patch) DeviceID() string { return p["deviceId"].(string) }
