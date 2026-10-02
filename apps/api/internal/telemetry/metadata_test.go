package telemetry

import (
	"math"
	"testing"
)

func TestReceiverMetadataRejectsNonFiniteAndOutOfRange(t *testing.T) {
	for _, v := range []float64{-201, 1, math.NaN(), math.Inf(1)} {
		if (ReceiverMetadata{RSSIDbm: &v}).Valid() {
			t.Fatalf("rssi accepted %v", v)
		}
	}
	for _, v := range []float64{-101, 101, math.NaN()} {
		if (ReceiverMetadata{SNRDb: &v}).Valid() {
			t.Fatalf("snr accepted %v", v)
		}
	}
	for _, v := range []float64{0, -1, 100001, math.Inf(-1)} {
		if (ReceiverMetadata{FrequencyMhz: &v}).Valid() {
			t.Fatalf("frequency accepted %v", v)
		}
	}
	for _, v := range []string{"", "bad\x00id", "bad\nid"} {
		if (ReceiverMetadata{GatewayID: &v}).Valid() {
			t.Fatal("gateway accepted")
		}
	}
	rssi, snr, frequency := -70.0, 8.0, 915.0
	gateway := "fixture"
	if !(ReceiverMetadata{GatewayID: &gateway, RSSIDbm: &rssi, SNRDb: &snr, FrequencyMhz: &frequency}).Valid() {
		t.Fatal("valid receiver rejected")
	}
}
