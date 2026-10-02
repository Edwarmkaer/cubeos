package ingestion

import (
	"bytes"
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"testing"
	"time"
)

func TestLateProjectionCannotRevivePreviousRestartEpoch(t *testing.T) {
	at := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	s := telemetry.Projection{}
	old := patch(t, `{"v":2,"id":"CS01","m":"E","n":100,"u":100000,"t":0,"st":1,"fl":0,"t1":1000,"rh":0,"p1":100000,"gr":0}`)
	s.ApplyEpoch(old, at, telemetry.ReceiverMetadata{}, 0)
	boot := patch(t, `{"v":2,"id":"CS01","m":"H","n":2,"u":200,"t":0,"st":0,"fl":0,"cam":0,"sd":0,"dp":0}`)
	s.ApplyEpoch(boot, at.Add(time.Second), telemetry.ReceiverMetadata{}, 1)
	before, _ := json.Marshal(s)
	previous := patch(t, `{"v":2,"id":"CS01","m":"E","n":101,"u":100100,"t":0,"st":1,"fl":0,"t1":2000,"rh":0,"p1":100000,"gr":0,"gx":1000}`)
	if s.ApplyReception(previous, at.Add(2*time.Second), telemetry.ReceiverMetadata{}, 0, false) {
		t.Fatal("old epoch changed current readings")
	}
	after, _ := json.Marshal(s)
	if !bytes.Equal(before, after) {
		t.Fatal("old epoch mutated state")
	}
	// A late field from the confirmed current boot may fill a missing group.
	current := patch(t, `{"v":2,"id":"CS01","m":"E","n":1,"u":100,"t":0,"st":0,"fl":0,"t1":2000,"rh":0,"p1":100000,"gr":0}`)
	if !s.ApplyReception(current, at.Add(3*time.Second), telemetry.ReceiverMetadata{}, 1, false) {
		t.Fatal("current boot late group lost")
	}
	if s.State.MinimumEpoch != 1 || s.FreshnessByGroup["E"].Epoch != 1 || s.Snapshot["lastSequence"] != json.Number("2") || s.Snapshot["sensors"].(telemetry.Object)["bme680"].(telemetry.Object)["status"] != "available" {
		t.Fatal("epoch/header/quality", s)
	}
}
