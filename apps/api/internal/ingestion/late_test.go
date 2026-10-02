package ingestion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPostgresLateFieldsKeepGlobalFrontierAndRebuild(t *testing.T) {
	url := os.Getenv("TEST_INGESTION_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("integration database required")
		}
		t.Skip("TEST_INGESTION_DATABASE_URL required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err = pool.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	if err = storage.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	principal, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	reader := telemetry.NewRepository(pool)
	service := NewService(NewRepository(pool))
	raw := func(m string, n, u uint32, flags int, fields string) string {
		return fmt.Sprintf(`{"v":2,"id":"CS01","m":%q,"n":%d,"u":%d,"t":0,"st":1,"fl":%d,%s}`, m, n, u, flags, fields)
	}
	e := func(n, u uint32, temp, flags int) string {
		return raw("E", n, u, flags, fmt.Sprintf(`"t1":%d,"rh":0,"p1":100000,"gr":0`, temp))
	}
	i := func(n, u uint32, flags int) string {
		return raw("I", n, u, flags, `"ax":0,"ay":0,"az":0,"gx":0,"gy":0,"gz":0`)
	}
	h := func(n, u uint32, flags int, extra string) string {
		fields := `"cam":0,"sd":0,"dp":0`
		if extra != "" {
			fields += "," + extra
		}
		return raw("H", n, u, flags, fields)
	}
	g := func(n, u uint32, fix, latitude int) string {
		return raw("G", n, u, 0, fmt.Sprintf(`"la":%d,"lo":0,"al":0,"sp":0,"hd":0,"fx":%d,"sa":11`, latitude, fix))
	}
	cases := []struct {
		name     string
		packets  []string
		revision int64
		check    func(*testing.T, telemetry.Projection)
	}{
		{"review-E100-I102-E101", []string{e(100, 100000, 1000, 0), i(102, 100200, 0), e(101, 100100, 2000, 0)}, 3, func(t *testing.T, s telemetry.Projection) {
			if s.Snapshot["sensors"].(telemetry.Object)["bme680"].(telemetry.Object)["temperatureC"] != json.Number("20.00") || s.FreshnessByGroup["E"].Sequence != 101 || s.Snapshot["lastSequence"] != json.Number("102") {
				t.Fatalf("late newest E lost %#v", s)
			}
		}},
		{"absent-group", []string{h(100, 100000, 0, ""), i(102, 100200, 0), raw("O", 101, 100100, 0, `"lx":0,"uvr":0,"uvm":0`)}, 3, func(t *testing.T, s telemetry.Projection) {
			if s.FreshnessByGroup["O"].Sequence != 101 || s.Snapshot["lastSequence"] != json.Number("102") {
				t.Fatal("absent group not filled")
			}
		}},
		{"truly-old", []string{e(100, 100000, 1000, 0), i(102, 100200, 0), e(99, 99900, 9900, 0)}, 2, func(t *testing.T, s telemetry.Projection) {
			if s.FreshnessByGroup["E"].Sequence != 100 {
				t.Fatal("old data replaced newer E")
			}
		}},
		{"partial-fields-any-m", []string{h(100, 100000, 0, `"gx":18,"ti":1000`), h(103, 100300, 0, `"ax":0,"t1":3000`), raw("I", 102, 100200, 0, `"ax":1234,"ay":0,"az":0,"gx":500,"gy":0,"gz":18,"ti":2000,"t1":2000`)}, 3, func(t *testing.T, s telemetry.Projection) {
			sensors := s.Snapshot["sensors"].(telemetry.Object)
			imu := sensors["mpu6050"].(telemetry.Object)
			if imu["accelerationG"].(telemetry.Object)["x"] != json.Number("0.000") || imu["angularRateDps"].(telemetry.Object)["x"] != json.Number("0.500") || sensors["bme680"].(telemetry.Object)["temperatureC"] != json.Number("30.00") || sensors["tmp102"].(telemetry.Object)["temperatureC"] != json.Number("20.00") {
				t.Fatal("field-wise order lost", sensors)
			}
			if s.FreshnessByGroup["I"].Sequence != 103 || s.FreshnessByGroup["I"].Fields["sensors.mpu6050.angularRateDps.x"].Sequence != 102 {
				t.Fatal("group/field freshness regressed")
			}
		}},
		{"newer-failure-survives-late-valid", []string{e(100, 100000, 1000, 0), i(102, 100200, 2), e(101, 100100, 2000, 0)}, 3, func(t *testing.T, s telemetry.Projection) {
			bme := s.Snapshot["sensors"].(telemetry.Object)["bme680"].(telemetry.Object)
			if bme["temperatureC"] != json.Number("20.00") || bme["status"] != "unavailable" || s.Snapshot["health"].(telemetry.Object)["flags"] != json.Number("2") {
				t.Fatal("late reading revived failed sensor", bme)
			}
		}},
		{"older-failure-keeps-newer-sensor", []string{e(100, 100000, 1000, 0), i(102, 100200, 0), e(101, 100100, 2000, 2)}, 3, func(t *testing.T, s telemetry.Projection) {
			sensors := s.Snapshot["sensors"].(telemetry.Object)
			if sensors["mpu6050"].(telemetry.Object)["status"] != "available" || sensors["bme680"].(telemetry.Object)["status"] != "unavailable" || s.Snapshot["health"].(telemetry.Object)["flags"] != json.Number("0") {
				t.Fatal("late failure moved newer quality/global state")
			}
		}},
		{"GPS-newer-no-fix-survives", []string{g(100, 100000, 3, 100000000), h(103, 100300, 1, `"fx":0`), g(102, 100200, 3, 200000000)}, 3, func(t *testing.T, s telemetry.Projection) {
			gps := s.Snapshot["sensors"].(telemetry.Object)["gps"].(telemetry.Object)
			if gps["latitudeDeg"] != json.Number("20.0000000") || gps["fix"] != json.Number("0") || gps["status"] != "unavailable" || s.Snapshot["lastSequence"] != json.Number("103") {
				t.Fatal("late GPS revived old fix", gps)
			}
			if s.FreshnessByGroup["G"].Fields["sensors.gps.latitudeDeg"].Sequence != 102 || s.FreshnessByGroup["G"].Sequence != 103 {
				t.Fatal("GPS field freshness regressed")
			}
		}},
		{"GPS-older-no-fix-ignored", []string{g(100, 100000, 3, 100000000), g(102, 100200, 3, 200000000), g(101, 100100, 0, 300000000)}, 2, func(t *testing.T, s telemetry.Projection) {
			gps := s.Snapshot["sensors"].(telemetry.Object)["gps"].(telemetry.Object)
			if gps["status"] != "available" || gps["fix"] != json.Number("3") || s.FreshnessByGroup["G"].Sequence != 102 {
				t.Fatal("old fix invalidated current GPS")
			}
		}},
		{"wrap-fills-previous-side-field", []string{e(4294967293, 4294967199, 1000, 0), i(0, 10, 0), e(4294967294, 4294967200, 2000, 0)}, 3, func(t *testing.T, s telemetry.Projection) {
			f := s.FreshnessByGroup["E"]
			if f.Epoch != 0 || f.Sequence != 4294967294 || s.Snapshot["lastSequence"] != json.Number("0") {
				t.Fatal("late wrap lost field or moved frontier")
			}
		}},
	}
	for index, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			device, err := devices.NewRepository(pool).Create(ctx, principal, devices.Input{Name: c.name, ProtocolDeviceID: "CS01"})
			if err != nil {
				t.Fatal(err)
			}
			var source string
			if err = pool.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',$2) RETURNING id::text", device.ID, fmt.Sprintf("%064x", index+10)).Scan(&source); err != nil {
				t.Fatal(err)
			}
			var headerBefore []byte
			for position, packet := range c.packets {
				r, err := service.Ingest(ctx, source, []byte(packet), telemetry.ReceiverMetadata{})
				if err != nil || r.Status != "accepted" {
					t.Fatalf("ingest %#v %v", r, err)
				}
				if position == 1 {
					current, err := reader.GetSnapshot(ctx, principal, device.ID)
					if err != nil {
						t.Fatal(err)
					}
					headerBefore = globalHeader(current)
					if index == 0 {
						if _, err = pool.Exec(ctx, `CREATE FUNCTION fail_late_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'late projection failure'; END $$; CREATE TRIGGER fail_late_projection BEFORE UPDATE ON device_snapshots FOR EACH ROW EXECUTE FUNCTION fail_late_projection()`); err != nil {
							t.Fatal(err)
						}
						if _, err = service.Ingest(ctx, source, []byte(c.packets[2]), telemetry.ReceiverMetadata{}); err == nil {
							t.Fatal("late projection fault swallowed")
						}
						var receipts int
						if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets WHERE device_id=$1 AND sequence=101", device.ID).Scan(&receipts); err != nil || receipts != 0 {
							t.Fatal("late projection partially committed", err)
						}
						if _, err = pool.Exec(ctx, "DROP TRIGGER fail_late_projection ON device_snapshots; DROP FUNCTION fail_late_projection()"); err != nil {
							t.Fatal(err)
						}
					}
				}
			}
			s, err := reader.GetSnapshot(ctx, principal, device.ID)
			if err != nil || s.Revision != c.revision {
				t.Fatalf("revision %d want %d %v", s.Revision, c.revision, err)
			}
			c.check(t, s)
			if !bytes.Equal(headerBefore, globalHeader(s)) {
				t.Fatal("late reception changed global header")
			}
			var updatedBefore, updatedAfter time.Time
			if err = pool.QueryRow(ctx, "SELECT updated_at FROM device_snapshots WHERE device_id=$1", device.ID).Scan(&updatedBefore); err != nil {
				t.Fatal(err)
			}
			before, _ := json.Marshal(s)
			if err = reader.Rebuild(ctx, principal, device.ID); err != nil {
				t.Fatal(err)
			}
			rebuilt, err := reader.GetSnapshot(ctx, principal, device.ID)
			if err != nil {
				t.Fatal(err)
			}
			after, _ := json.Marshal(rebuilt)
			if !bytes.Equal(before, after) {
				t.Fatalf("rebuild differs %s\n%s", before, after)
			}
			if err = pool.QueryRow(ctx, "SELECT updated_at FROM device_snapshots WHERE device_id=$1", device.ID).Scan(&updatedAfter); err != nil || !updatedBefore.Equal(updatedAfter) {
				t.Fatal("rebuild changed mutation timestamp", err)
			}
			if index == 0 {
				if _, err = pool.Exec(ctx, "UPDATE device_snapshots SET projection=projection-'projectionState' WHERE device_id=$1", device.ID); err != nil {
					t.Fatal(err)
				}
				upgraded, _ := json.Marshal(mustSnapshot(t, reader, ctx, principal, device.ID))
				if !bytes.Equal(after, upgraded) {
					t.Fatal("legacy cache lost field/quality ordering provenance")
				}
				if err = reader.Rebuild(ctx, principal, device.ID); err != nil {
					t.Fatal(err)
				}
			}
			if dir := os.Getenv("TEST_PROJECTION_EVIDENCE_DIR"); dir != "" {
				if err = os.MkdirAll(dir, 0700); err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(filepath.Join(dir, c.name+".json"), after, 0600); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
	t.Run("confirmed-restart-late-current-epoch", func(t *testing.T) {
		device, err := devices.NewRepository(pool).Create(ctx, principal, devices.Input{Name: "Restart late", ProtocolDeviceID: "CS01"})
		if err != nil {
			t.Fatal(err)
		}
		var source string
		if err = pool.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',repeat('9',64)) RETURNING id::text", device.ID).Scan(&source); err != nil {
			t.Fatal(err)
		}
		boot := func(n, u uint32) string {
			return string(bytes.Replace([]byte(h(n, u, 0, "")), []byte(`"st":1`), []byte(`"st":0`), 1))
		}
		packets := []struct{ raw, status string }{{e(100, 100000, 1000, 0), "accepted"}, {boot(1, 100), "rejected"}, {boot(2, 200), "accepted"}, {e(1, 100, 2000, 0), "accepted"}, {e(100, 100000, 1000, 0), "duplicated"}, {e(99, 99900, 9900, 0), "rejected"}}
		var headerBefore []byte
		for pos, p := range packets {
			r, err := service.Ingest(ctx, source, []byte(p.raw), telemetry.ReceiverMetadata{})
			if err != nil || r.Status != p.status {
				t.Fatalf("restart reception %#v %v", r, err)
			}
			if pos == 2 {
				headerBefore = globalHeader(mustSnapshot(t, reader, ctx, principal, device.ID))
			}
		}
		s := mustSnapshot(t, reader, ctx, principal, device.ID)
		if s.Revision != 3 || s.State.MinimumEpoch != 1 || s.FreshnessByGroup["E"].Epoch != 1 || s.FreshnessByGroup["E"].Sequence != 1 || s.Snapshot["sensors"].(telemetry.Object)["bme680"].(telemetry.Object)["temperatureC"] != json.Number("20.00") {
			t.Fatal("restart late field/order", s)
		}
		if !bytes.Equal(headerBefore, globalHeader(s)) {
			t.Fatal("late restart fields changed BOOT header")
		}
		before, _ := json.Marshal(s)
		if err = reader.Rebuild(ctx, principal, device.ID); err != nil {
			t.Fatal(err)
		}
		after, _ := json.Marshal(mustSnapshot(t, reader, ctx, principal, device.ID))
		if !bytes.Equal(before, after) {
			t.Fatal("restart late rebuild differs")
		}
		if dir := os.Getenv("TEST_PROJECTION_EVIDENCE_DIR"); dir != "" {
			if err = os.WriteFile(filepath.Join(dir, "restart-late.json"), after, 0600); err != nil {
				t.Fatal(err)
			}
		}
	})
}
func globalHeader(s telemetry.Projection) []byte {
	o := telemetry.Object{}
	for _, k := range []string{"receivedAt", "lastSequence", "deviceTime", "missionState", "health"} {
		o[k] = s.Snapshot[k]
	}
	b, _ := json.Marshal(o)
	return b
}
