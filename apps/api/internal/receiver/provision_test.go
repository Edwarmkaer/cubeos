package receiver

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_RECEIVER_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("exclusive receiver database required")
		}
		t.Skip("exclusive receiver database required")
	}
	p, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	if _, err = p.Exec(context.Background(), "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	if err = storage.Migrate(context.Background(), p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestEnsureConcurrentAndRepeatable(t *testing.T) {
	p := testPool(t)
	ctx := context.Background()
	const id = "85f25882-661d-4e01-82d0-48c97b7c8c45"
	var wg sync.WaitGroup
	results := make(chan Binding, 8)
	failures := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, e := Ensure(ctx, p, id)
			if e != nil {
				failures <- e
			} else {
				results <- b
			}
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for e := range failures {
		t.Fatal(e)
	}
	var first Binding
	for b := range results {
		if first.DeviceID == "" {
			first = b
		}
		if b != first {
			t.Fatalf("different bindings: %v %v", first, b)
		}
	}
	if first.BindingID != id || first.ProtocolDeviceID != "CS01" || first.DeviceID == "" || first.SourceID == "" {
		t.Fatal(first)
	}
	for _, table := range []string{"devices", "ingestion_sources", "local_receivers"} {
		var n int
		if e := p.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&n); e != nil || n != 1 {
			t.Fatalf("%s %d %v", table, n, e)
		}
	}
}

func TestEnsureInvalidRevokedAndForeignNeverReprovisions(t *testing.T) {
	p := testPool(t)
	ctx := context.Background()
	if _, e := Ensure(ctx, p, "bad"); e == nil {
		t.Fatal("invalid UUID accepted")
	}
	const id = "85f25882-661d-4e01-82d0-48c97b7c8c45"
	b, e := Ensure(ctx, p, id)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.Exec(ctx, "UPDATE ingestion_sources SET revoked_at=now() WHERE id=$1", b.SourceID); e != nil {
		t.Fatal(e)
	}
	if _, e = Ensure(ctx, p, id); e == nil {
		t.Fatal("revoked binding accepted")
	}
	if _, e = p.Exec(ctx, "UPDATE ingestion_sources SET revoked_at=NULL,transport='http' WHERE id=$1", b.SourceID); e != nil {
		t.Fatal(e)
	}
	if _, e = Ensure(ctx, p, id); e == nil {
		t.Fatal("wrong transport accepted")
	}
	if _, e = p.Exec(ctx, "UPDATE ingestion_sources SET transport='serial' WHERE id=$1", b.SourceID); e != nil {
		t.Fatal(e)
	}
	var foreign string
	if e = p.QueryRow(ctx, "INSERT INTO users(display_name) VALUES('other owner') RETURNING id::text").Scan(&foreign); e != nil {
		t.Fatal(e)
	}
	if _, e = p.Exec(ctx, "UPDATE devices SET owner_user_id=$1 WHERE id=$2", foreign, b.DeviceID); e != nil {
		t.Fatal(e)
	}
	if _, e = Ensure(ctx, p, id); e == nil {
		t.Fatal("foreign device adopted")
	}
	var n int
	p.QueryRow(ctx, "SELECT count(*) FROM devices").Scan(&n)
	if n != 1 {
		t.Fatal("created duplicate", n)
	}
}

func TestEnsureRollbackAndMismatchedSource(t *testing.T) {
	p := testPool(t)
	ctx := context.Background()
	_, e := p.Exec(ctx, `CREATE FUNCTION reject_receiver() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced'; END $$;
 CREATE TRIGGER reject_receiver BEFORE INSERT ON local_receivers FOR EACH ROW EXECUTE FUNCTION reject_receiver();`)
	if e != nil {
		t.Fatal(e)
	}
	const id = "85f25882-661d-4e01-82d0-48c97b7c8c45"
	if _, e = Ensure(ctx, p, id); e == nil {
		t.Fatal("failed transaction accepted")
	}
	var n int
	p.QueryRow(ctx, "SELECT count(*) FROM devices").Scan(&n)
	if n != 0 {
		t.Fatal("partial device committed", n)
	}
	p.Exec(ctx, "DROP TRIGGER reject_receiver ON local_receivers")
	a, e := Ensure(ctx, p, id)
	if e != nil {
		t.Fatal(e)
	}
	b, e := Ensure(ctx, p, "d98a5d96-e4df-4c6d-9529-d028449ab9c5")
	if e != nil {
		t.Fatal(e)
	}
	p.Exec(ctx, "UPDATE ingestion_sources SET device_id=$1 WHERE id=$2", b.DeviceID, a.SourceID)
	if _, e = Ensure(ctx, p, id); e == nil {
		t.Fatal("mismatched source accepted")
	}
}

func TestExistingBindingNeverCreatesRecordsAfterRestore(t *testing.T) {
	p := testPool(t)
	ctx := context.Background()
	want := Binding{BindingID: "85f25882-661d-4e01-82d0-48c97b7c8c45", DeviceID: "11111111-1111-4111-8111-111111111111", SourceID: "22222222-2222-4222-8222-222222222222", ProtocolDeviceID: "CS01"}
	if _, e := EnsureExisting(ctx, p, want); e == nil {
		t.Fatal("missing restored binding accepted")
	}
	var n int
	p.QueryRow(ctx, "SELECT count(*) FROM devices").Scan(&n)
	if n != 0 {
		t.Fatal("restore silently created device")
	}
	b, e := Ensure(ctx, p, want.BindingID)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = EnsureExisting(ctx, p, want); e == nil {
		t.Fatal("different device accepted")
	}
	got, e := EnsureExisting(ctx, p, b)
	if e != nil || got != b {
		t.Fatal(got, e)
	}
}
