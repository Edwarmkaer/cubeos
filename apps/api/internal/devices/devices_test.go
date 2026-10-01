package devices

import (
	"strings"
	"testing"
)

func TestInputsDoNotAllowBlankOversizedOrInvalidFlightIDs(t *testing.T) {
	for _, v := range []Input{{Name: "", ProtocolDeviceID: "CS01"}, {Name: "demo", ProtocolDeviceID: "bad id"}, {Name: "demo", ProtocolDeviceID: ""}, {Name: "demo", ProtocolDeviceID: "cs01"}, {Name: "demo", ProtocolDeviceID: "A"}, {Name: "demo", ProtocolDeviceID: "ABCDEFGHIJKLM"}} {
		if v.Validate() == nil {
			t.Errorf("accepted %v", v)
		}
	}
	if (Input{Name: "Mi CubeSat", ProtocolDeviceID: "CS01"}).Validate() != nil {
		t.Fatal("valid input rejected")
	}
	for _, name := range []string{strings.Repeat("ñ", 121), "nul\x00name"} {
		if (Input{Name: name, ProtocolDeviceID: "CS01"}).Validate() == nil {
			t.Errorf("unsafe name accepted %q", name)
		}
	}
}
