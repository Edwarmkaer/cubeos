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
	"reflect"
	"sync"
	"testing"
)

func TestPostgresIngestionEvidenceAtomicityConcurrencyAndRebuild(t *testing.T) {
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
	a, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	b := identity.Principal{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
	if _, err = pool.Exec(ctx, "INSERT INTO users(id,display_name) VALUES($1,'B')", b.UserID); err != nil {
		t.Fatal(err)
	}
	d, err := devices.NewRepository(pool).Create(ctx, a, devices.Input{Name: "A", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := devices.NewRepository(pool).Create(ctx, b, devices.Input{Name: "B", ProtocolDeviceID: "CS02"})
	if err != nil {
		t.Fatal(err)
	}
	var source, revoked string
	if err = pool.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash,external_gateway_id) VALUES($1,'http',repeat('1',64),'registered-gateway') RETURNING id::text", d.ID).Scan(&source); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash,revoked_at) VALUES($1,'serial',repeat('2',64),now()) RETURNING id::text", d.ID).Scan(&revoked); err != nil {
		t.Fatal(err)
	}
	service := NewService(NewRepository(pool))
	reader := telemetry.NewRepository(pool)
	ingest := func(src string, raw []byte, want string) IngestResult {
		t.Helper()
		r, e := service.Ingest(ctx, src, raw, telemetry.ReceiverMetadata{})
		if e != nil || r.Status != want {
			t.Fatalf("%s: %#v %v want %s", raw, r, e, want)
		}
		return r
	}
	h := func(n, u int) []byte {
		return []byte(fmt.Sprintf(`{"v":2,"id":"CS01","m":"H","n":%d,"u":%d,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}`, n, u))
	}
	first := h(100, 100000)
	r := ingest(source, first, "accepted")
	if r.Revision != 1 {
		t.Fatal(r)
	}
	ingest(source, first, "duplicated")
	lexical := bytes.Replace(first, []byte(`"n":100`), []byte(`"n":100.0`), 1)
	ingest(source, lexical, "duplicated")
	conflict := bytes.Replace(first, []byte(`"cam":0`), []byte(`"cam":1`), 1)
	if ingest(source, conflict, "rejected").Cause != "sequence_conflict" {
		t.Fatal("untraced conflict")
	}
	ingest(source, h(99, 99900), "accepted")
	ingest(source, []byte(`{bad-json`), "rejected")
	ingest(source, bytes.Replace(first, []byte("CS01"), []byte("CS02"), 1), "rejected")
	ingest(revoked, first, "rejected")
	ingest("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", first, "rejected")
	ingest(source, bytes.Repeat([]byte{'x'}, MaxPayloadBytes+1), "rejected")
	var saved []byte
	var size int
	var truncated bool
	if err = pool.QueryRow(ctx, "SELECT raw_payload,raw_size,raw_truncated FROM received_packets WHERE cause='payload_too_large'").Scan(&saved, &size, &truncated); err != nil || size != 8193 || len(saved) != 8192 || !truncated {
		t.Fatalf("bounded evidence: %d %d %v %v", len(saved), size, truncated, err)
	}
	if err = pool.QueryRow(ctx, "SELECT raw_payload FROM received_packets WHERE cause='invalid_uplink'").Scan(&saved); err != nil || string(saved) != "{bad-json" {
		t.Fatalf("raw mutated %s %v", saved, err)
	}
	s, err := reader.GetSnapshot(ctx, a, d.ID)
	if err != nil || s.Revision != 1 {
		t.Fatalf("reject/late changed projection %#v %v", s, err)
	}
	if s.Snapshot["gateway"].(telemetry.Object)["id"] != "registered-gateway" {
		t.Fatal("registered gateway lost")
	}
	ingest("CS01", first, "rejected")
	if _, err = reader.GetSnapshot(ctx, b, d.ID); err != devices.ErrNotFound {
		t.Fatalf("snapshot ownership %v", err)
	}
	if _, err = reader.ListPackets(ctx, b, d.ID, telemetry.Filter{}, "", 10); err != devices.ErrNotFound {
		t.Fatalf("history ownership %v", err)
	}
	if _, err = reader.GetSnapshot(ctx, a, other.ID); err != devices.ErrNotFound {
		t.Fatal("reverse isolation")
	}
	// Real database fault after evidence insertion must roll back the whole
	// reception, logical identity, frontier and projection, permitting retry.
	if _, err = pool.Exec(ctx, `CREATE FUNCTION fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_projection BEFORE UPDATE ON device_snapshots FOR EACH ROW EXECUTE FUNCTION fail_projection()`); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Ingest(ctx, source, h(101, 100100), telemetry.ReceiverMetadata{}); err == nil {
		t.Fatal("fault swallowed")
	}
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets WHERE sequence=101").Scan(&count); err != nil || count != 0 {
		t.Fatal("partial evidence committed")
	}
	if _, err = pool.Exec(ctx, "DROP TRIGGER fail_projection ON device_snapshots; DROP FUNCTION fail_projection()"); err != nil {
		t.Fatal(err)
	}
	ingest(source, h(101, 100100), "accepted")
	// Concurrent retransmissions serialize in PostgreSQL even across independent
	// service instances. Exactly one reception becomes a logical/projected sample.
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, e := NewService(NewRepository(pool)).Ingest(ctx, source, h(102, 100200), telemetry.ReceiverMetadata{})
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets WHERE device_id=$1 AND sequence=102 AND logical", d.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate samples %d %v", count, err)
	}
	s, err = reader.GetSnapshot(ctx, a, d.ID)
	if err != nil || s.Revision != 3 {
		t.Fatalf("concurrent revision %d %v", s.Revision, err)
	}
	before, _ := json.Marshal(s)
	if _, err = pool.Exec(ctx, "DELETE FROM device_snapshots WHERE device_id=$1", d.ID); err != nil {
		t.Fatal(err)
	}
	if err = reader.Rebuild(ctx, a, d.ID); err != nil {
		t.Fatal(err)
	}
	rebuilt, err := reader.GetSnapshot(ctx, a, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(rebuilt)
	if !bytes.Equal(before, after) {
		t.Fatalf("nondeterministic rebuild %s\n%s", before, after)
	}
	// A fresh pool/service simulates API restart; closing connections cannot
	// erase evidence. Docker smoke additionally restarts the DB with its volume.
	pool.Close()
	pool, err = pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	reader = telemetry.NewRepository(pool)
	restarted, err := reader.GetSnapshot(ctx, a, d.ID)
	if err != nil || !reflect.DeepEqual(rebuilt, restarted) {
		t.Fatal("restart lost projection", err)
	}
	page, err := reader.ListPackets(ctx, a, d.ID, telemetry.Filter{}, "", 2)
	if err != nil || len(page.Packets) != 2 || page.NextCursor == "" {
		t.Fatalf("page %#v %v", page, err)
	}
	seen := map[int64]bool{}
	capID := page.Watermark
	for {
		for _, p := range page.Packets {
			if seen[p.ID] || p.ID > capID {
				t.Fatal("pagination duplicate/future")
			}
			seen[p.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		page, err = reader.ListPackets(ctx, a, d.ID, telemetry.Filter{}, page.NextCursor, 2)
		if err != nil {
			t.Fatal(err)
		}
	}
	var expected int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets WHERE device_id=$1 AND id<=$2", d.ID, capID).Scan(&expected); err != nil || len(seen) != expected {
		t.Fatalf("pagination gaps %d/%d %v", len(seen), expected, err)
	}
	service = NewService(NewRepository(pool))
	// Concurrent distinct packets may arrive out of order, but never move the
	// frontier backwards. History retains every logical sample.
	errs = make(chan error, 20)
	for n := 103; n <= 122; n++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_, e := service.Ingest(ctx, source, h(n, 100000+(n-100)*100), telemetry.ReceiverMetadata{})
			errs <- e
		}(n)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	s, err = reader.GetSnapshot(ctx, a, d.ID)
	if err != nil || s.Snapshot["lastSequence"] != json.Number("122") {
		t.Fatalf("frontier regressed %#v %v", s, err)
	}
	beforeRevision := s.Revision
	if r := ingest(source, h(1, 100), "rejected"); r.Epoch != nil {
		t.Fatal("ambiguous reception assigned to an epoch")
	}
	boot := func(n, u int) []byte { return bytes.Replace(h(n, u), []byte(`"st":1`), []byte(`"st":0`), 1) }
	if ingest(source, boot(1, 100), "rejected").Cause != "restart_candidate" {
		t.Fatal("missing restart trace")
	}
	r = ingest(source, boot(2, 200), "accepted")
	if r.Epoch == nil || *r.Epoch != 1 || r.Revision != beforeRevision+1 {
		t.Fatal("unconfirmed epoch", r)
	}
	r = ingest(source, first, "duplicated")
	if r.Epoch == nil || *r.Epoch != 0 {
		t.Fatal("old retransmission moved epoch")
	}
	if ingest(source, h(123, 102300), "rejected").Cause != "ambiguous" {
		t.Fatal("old unseen epoch accepted")
	}
	ingest(source, h(3, 300), "accepted")
	before, _ = json.Marshal(mustSnapshot(t, reader, ctx, a, d.ID))
	if err = reader.Rebuild(ctx, a, d.ID); err != nil {
		t.Fatal(err)
	}
	after, _ = json.Marshal(mustSnapshot(t, reader, ctx, a, d.ID))
	if !bytes.Equal(before, after) {
		t.Fatal("epoch rebuild differs")
	}
}
func mustSnapshot(t *testing.T, r *telemetry.Repository, ctx context.Context, p identity.Principal, id string) telemetry.Projection {
	t.Helper()
	s, e := r.GetSnapshot(ctx, p, id)
	if e != nil {
		t.Fatal(e)
	}
	return s
}
