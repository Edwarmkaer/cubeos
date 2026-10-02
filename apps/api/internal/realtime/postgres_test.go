package realtime_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPostgresCommittedIngestionToAuthorizedSSE(t *testing.T) {
	database := os.Getenv("TEST_REALTIME_DATABASE_URL")
	if database == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_REALTIME_DATABASE_URL required")
		}
		t.Skip("TEST_REALTIME_DATABASE_URL required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, database)
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
	repo := devices.NewRepository(pool)
	d, err := repo.Create(ctx, a, devices.Input{Name: "Realtime A", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	sources := ingestion.NewSources(pool)
	source, err := sources.Create(ctx, a, d.ID, ingestion.SourceInput{Transport: "http"})
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(func(k string) string {
		if k == "DATABASE_URL" {
			return database
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	hub := realtime.NewHub()
	defer hub.Close()
	listenerCtx, stopListener := context.WithCancel(ctx)
	defer stopListener()
	go hub.Run(listenerCtx, database)
	resolver := func(_ context.Context, r *http.Request) (identity.Principal, error) {
		if token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer expires-"); token != r.Header.Get("Authorization") {
			n, err := strconv.ParseInt(token, 10, 64)
			if err != nil {
				return identity.Principal{}, err
			}
			return identity.Principal{UserID: a.UserID, ExpiresAt: time.Unix(0, n)}, nil
		}
		switch r.Header.Get("Authorization") {
		case "Bearer owner-A":
			return a, nil
		case "Bearer owner-B":
			return b, nil
		default:
			return identity.Principal{}, nil
		}
	}
	handler := api.NewWithRealtime(cfg, pool, repo, telemetry.NewRepository(pool), resolver, hub)
	server := httptest.NewServer(handler)
	defer server.Close()
	target := server.URL + "/api/v1/devices/" + d.ID
	request := func(path, token string) (*http.Response, error) {
		r, _ := http.NewRequestWithContext(ctx, "GET", target+path, nil)
		r.Host = "127.0.0.1:8080"
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Last-Event-ID", d.ID+":999")
		return server.Client().Do(r)
	}
	for _, token := range []string{"owner-B", source.Credential} {
		response, e := request("/events", token)
		if e != nil {
			t.Fatal(e)
		}
		response.Body.Close()
		want := 404
		if token == source.Credential {
			want = 401
		}
		if response.StatusCode != want {
			t.Fatal(response.StatusCode, want)
		}
	}
	// A separate PostgreSQL connection certifies actual commit notifications.
	notice, err := pgx.Connect(ctx, database)
	if err != nil {
		t.Fatal(err)
	}
	defer notice.Close(context.Background())
	if _, err = notice.Exec(ctx, "LISTEN cubeos_snapshot"); err != nil {
		t.Fatal(err)
	}
	response, err := request("/events", "owner-A")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatal(response.StatusCode)
	}
	updates := make(chan string, 32)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		scanner := bufio.NewScanner(response.Body)
		for scanner.Scan() {
			if strings.HasPrefix(scanner.Text(), "data: ") {
				updates <- strings.TrimPrefix(scanner.Text(), "data: ")
			}
		}
	}()
	ingest := func(n int) ingestion.IngestResult {
		t.Helper()
		raw := fmt.Sprintf(`{"envelopeVersion":1,"payload":{"v":2,"id":"CS01","m":"H","n":%d,"u":%d,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}}`, n, n)
		r, _ := http.NewRequestWithContext(ctx, "POST", server.URL+"/api/v1/ingestion/packets", strings.NewReader(raw))
		r.Host = "127.0.0.1:8080"
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+source.Credential)
		res, e := server.Client().Do(r)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		var result ingestion.IngestResult
		if e = json.NewDecoder(res.Body).Decode(&result); e != nil || res.StatusCode != 200 {
			t.Fatal(e, res.StatusCode)
		}
		return result
	}
	expect := func(want int64) {
		t.Helper()
		select {
		case raw := <-updates:
			var p realtime.SnapshotEvent
			if e := json.Unmarshal([]byte(raw), &p); e != nil || p.Revision != want {
				t.Fatal(raw, e)
			}
			stored, e := telemetry.NewRepository(pool).GetSnapshot(ctx, a, d.ID)
			if e != nil || stored.Revision != p.Revision {
				t.Fatal("uncommitted snapshot", e)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("SSE update missing")
		}
	}
	if ingest(1).Status != "accepted" {
		t.Fatal("first rejected")
	}
	expect(1)
	wait, c := context.WithTimeout(ctx, time.Second)
	notification, e := notice.WaitForNotification(wait)
	c()
	if e != nil || notification.Payload != d.ID {
		t.Fatal("transaction notice missing", e)
	}
	if ingest(1).Status != "duplicated" {
		t.Fatal("duplicate")
	}
	service := ingestion.NewService(ingestion.NewRepository(pool))
	noOp := []byte(`{"v":2,"id":"CS01","m":"H","n":0,"u":0,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}`)
	noOpResult, e := service.Ingest(ctx, source.ID, noOp, telemetry.ReceiverMetadata{})
	if e != nil || noOpResult.Status != "accepted" || noOpResult.Revision != 1 {
		t.Fatal("late no-op", noOpResult, e)
	}
	if _, e = service.Ingest(ctx, source.ID, []byte(`{invalid`), telemetry.ReceiverMetadata{}); e != nil {
		t.Fatal(e)
	}
	// A trigger aborts Store before commit: no commit,
	// no projection and no notification may escape that transaction.
	if _, e = pool.Exec(ctx, `CREATE FUNCTION fail_realtime_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rollback fixture'; END $$; CREATE TRIGGER fail_realtime_commit BEFORE UPDATE ON device_telemetry_state FOR EACH ROW WHEN (NEW.revision > OLD.revision) EXECUTE FUNCTION fail_realtime_commit()`); e != nil {
		t.Fatal(e)
	}
	raw := []byte(`{"v":2,"id":"CS01","m":"H","n":2,"u":2,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}`)
	if _, e = service.Ingest(ctx, source.ID, raw, telemetry.ReceiverMetadata{}); e == nil {
		t.Fatal("rollback missing")
	}
	if _, e = pool.Exec(ctx, "DROP TRIGGER fail_realtime_commit ON device_telemetry_state"); e != nil {
		t.Fatal(e)
	}
	wait, c = context.WithTimeout(ctx, 100*time.Millisecond)
	_, e = notice.WaitForNotification(wait)
	c()
	if e == nil {
		t.Fatal("rejection/duplicate/rollback notified")
	}
	select {
	case raw := <-updates:
		t.Fatal("uncommitted/rejected event", raw)
	case <-time.After(100 * time.Millisecond):
	}
	if ingest(2).Revision != 2 {
		t.Fatal("revision")
	}
	expect(2)
	wait, c = context.WithTimeout(ctx, time.Second)
	notification, e = notice.WaitForNotification(wait)
	c()
	if e != nil || notification.Payload != d.ID {
		t.Fatal("second commit notice missing", e)
	}
	if e = sources.Revoke(ctx, a, d.ID, source.ID); e != nil {
		t.Fatal(e)
	}
	if result, e := service.Ingest(ctx, source.ID, []byte(`{"v":2,"id":"CS01","m":"H","n":3,"u":3,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}`), telemetry.ReceiverMetadata{}); e != nil || result.Cause != "source_revoked" || result.Revision != 2 {
		t.Fatal("revoked source changed state", result, e)
	}
	wait, c = context.WithTimeout(ctx, 100*time.Millisecond)
	_, e = notice.WaitForNotification(wait)
	c()
	if e == nil {
		t.Fatal("revoked source notified")
	}
	response.Body.Close()
	<-readDone
	// Last-Event-ID is only a hint; reconnect always obtains current durable state.
	reconnect, e := request("/events", "owner-A")
	if e != nil {
		t.Fatal(e)
	}
	line, e := bufio.NewReader(reconnect.Body).ReadString('\n')
	reconnect.Body.Close()
	if e != nil || line != "id: "+d.ID+":2\n" {
		t.Fatal(line, e)
	}
	expiring, e := request("/events", "expires-"+strconv.FormatInt(time.Now().Add(150*time.Millisecond).UnixNano(), 10))
	if e != nil {
		t.Fatal(e)
	}
	if expiring.StatusCode != 200 {
		t.Fatal("session fixture not opened", expiring.StatusCode)
	}
	expired := make(chan struct{})
	go func() { _, _ = io.ReadAll(expiring.Body); expiring.Body.Close(); close(expired) }()
	select {
	case <-expired:
	case <-time.After(time.Second):
		t.Fatal("PG-backed stream ignored session expiry")
	}
	// Ownership transfer closes the existing connection before any new payload.
	active, e := request("/events", "owner-A")
	if e != nil {
		t.Fatal(e)
	}
	defer active.Body.Close()
	reader := bufio.NewReader(active.Body)
	for {
		line, e = reader.ReadString('\n')
		if e != nil {
			t.Fatal(e)
		}
		if line == "\n" {
			break
		}
	}
	if _, e = pool.Exec(ctx, "UPDATE devices SET owner_user_id=$2 WHERE id=$1", d.ID, b.UserID); e != nil {
		t.Fatal(e)
	}
	hub.Notify(d.ID)
	ended := make(chan error, 1)
	go func() { _, e := io.ReadAll(reader); ended <- e }()
	select {
	case <-ended:
	case <-time.After(time.Second):
		t.Fatal("ownership recheck failed")
	}
	// Host/route separation already belongs to RestrictedHTTP; SSE never appears
	// on the LAN transport. UUID IDs are device scoped even with duplicate CS01.
}
