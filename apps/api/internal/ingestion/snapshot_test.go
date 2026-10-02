package ingestion

import (
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"testing"
	"time"
)

func patch(t *testing.T, raw string) telemetry.Patch {
	t.Helper()
	p, e := Validate([]byte(raw))
	if e != nil {
		t.Fatal(e)
	}
	return Normalize(p)
}
func TestProjectionFreshnessAbsenceFailuresAndGPSQuality(t *testing.T) {
	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	s := telemetry.Projection{}
	e := patch(t, `{"v":2,"id":"CS01","m":"E","n":1,"u":1,"t":0,"st":1,"fl":0,"t1":2465,"rh":0,"p1":100000,"gr":0}`)
	s.Apply(e, at, telemetry.ReceiverMetadata{})
	first := s.FreshnessByGroup["E"].ReceivedAt
	s.Apply(patch(t, `{"v":2,"id":"CS01","m":"I","n":2,"u":2,"t":0,"st":1,"fl":0,"ax":0,"ay":0,"az":0,"gx":0,"gy":0,"gz":18}`), at.Add(time.Second), telemetry.ReceiverMetadata{})
	if s.Revision != 2 || s.FreshnessByGroup["E"].ReceivedAt != first || s.FreshnessByGroup["G"].ReceivedAt != "" {
		t.Fatal("cross-group freshness")
	}
	sensors := s.Snapshot["sensors"].(telemetry.Object)
	if sensors["gps"].(telemetry.Object)["status"] != "unverified" || s.Snapshot["power"].(telemetry.Object)["batteryVoltageV"] != nil {
		t.Fatal("invented measurements")
	}
	s.Apply(patch(t, `{"v":2,"id":"CS01","m":"H","n":3,"u":3,"t":0,"st":1,"fl":2,"cam":0,"sd":0,"dp":0,"t1":9999}`), at.Add(2*time.Second), telemetry.ReceiverMetadata{})
	bme := sensors["bme680"].(telemetry.Object)
	if bme["temperatureC"] != json.Number("24.65") || bme["status"] != "unavailable" || s.FreshnessByGroup["E"].ReceivedAt != first {
		t.Fatal("failure replaced last valid measurement")
	}
	if sensors["bmp280"].(telemetry.Object)["status"] != "unverified" {
		t.Fatal("global sensor error invented installation evidence")
	}
	s.Apply(patch(t, `{"v":2,"id":"CS01","m":"H","n":4,"u":4,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0,"la":0,"lo":0,"fx":1}`), at.Add(3*time.Second), telemetry.ReceiverMetadata{})
	gps := sensors["gps"].(telemetry.Object)
	if gps["status"] == "available" || gps["latitudeDeg"] != nil {
		t.Fatal("unverified fix promoted")
	}
	s.Apply(patch(t, `{"v":2,"id":"CS01","m":"H","n":5,"u":5,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0,"la":0,"lo":0,"fx":3}`), at.Add(4*time.Second), telemetry.ReceiverMetadata{})
	if gps["status"] != "available" || gps["latitudeDeg"] != json.Number("0.0000000") {
		t.Fatal("valid measured zero lost")
	}
	s.Apply(patch(t, `{"v":2,"id":"CS01","m":"H","n":6,"u":6,"t":0,"st":1,"fl":1,"cam":0,"sd":0,"dp":0,"fx":0}`), at.Add(5*time.Second), telemetry.ReceiverMetadata{})
	if gps["status"] != "unavailable" || gps["latitudeDeg"] != json.Number("0.0000000") {
		t.Fatal("invalid fix erased last valid")
	}
	if gps["fix"] != json.Number("0") {
		t.Fatal("current no-fix quality lost")
	}
}
