package telemetry

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type brokenWriter struct{}

func (brokenWriter) Write([]byte) (int, error) { return 0, errors.New("sink failed") }
func TestCSVPresencePageBoundCancellationAndWriteFailure(t *testing.T) {
	group := "H"
	epoch, n, u := int64(0), int64(1), int64(1)
	packets := []Packet{{ID: 1, Group: &group, Epoch: &epoch, Sequence: &n, Uptime: &u, ReceivedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), Logical: true, Normalized: Patch{"health": Object{"flags": json.Number("0")}, "power": Object{"batteryVoltageV": json.Number("0")}, "payload": Object{"cameraOk": false}}}}
	var b bytes.Buffer
	if err := WriteCSV(context.Background(), &b, "H", packets); err != nil {
		t.Fatal(err)
	}
	rows, err := csv.NewReader(strings.NewReader(b.String())).ReadAll()
	if err != nil || len(rows) != 2 || rows[1][6] != "0" || rows[1][7] != "" || rows[1][9] != "false" {
		t.Fatalf("presence %#v %v", rows, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if WriteCSV(ctx, &b, "H", packets) == nil {
		t.Fatal("cancellation ignored")
	}
	if WriteCSV(context.Background(), brokenWriter{}, "H", packets) == nil {
		t.Fatal("sink error ignored")
	}
	if WriteCSV(context.Background(), &b, "H", make([]Packet, 201)) != ErrQuery {
		t.Fatal("unbounded page")
	}
}
