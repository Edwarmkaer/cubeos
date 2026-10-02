package http_test

import (
	"context"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestTelemetryRESTIsolationFiltersCursorAndCSV(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_DATABASE_URL required")
		}
		t.Skip("TEST_DATABASE_URL required")
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
	principal := a
	cfg, err := config.Load(func(k string) string {
		if k == "DATABASE_URL" {
			return url
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	d, err := devices.NewRepository(pool).Create(ctx, a, devices.Input{Name: "Telemetry", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	var source string
	if err = pool.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',repeat('3',64)) RETURNING id::text", d.ID).Scan(&source); err != nil {
		t.Fatal(err)
	}
	service := ingestion.NewService(ingestion.NewRepository(pool))
	h := api.New(cfg, pool, devices.NewRepository(pool), func(context.Context, *http.Request) (identity.Principal, error) { return principal, nil })
	path := "/api/v1/devices/" + d.ID
	get := func(suffix string, code int) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "http://127.0.0.1:8080"+path+suffix, nil))
		if w.Code != code {
			t.Fatalf("%s: %d %s", suffix, w.Code, w.Body.String())
		}
		return w
	}
	get("/snapshot", 404)
	for n := 1; n <= 5; n++ {
		raw := fmt.Sprintf(`{"v":2,"id":"CS01","m":"E","n":%d,"u":%d,"t":0,"st":1,"fl":0,"t1":0,"rh":0,"p1":100000,"gr":0}`, n, n)
		if _, err = service.Ingest(ctx, source, []byte(raw), telemetry.ReceiverMetadata{}); err != nil {
			t.Fatal(err)
		}
	}
	w := get("/snapshot", 200)
	var snapshot telemetry.Projection
	if err = json.Unmarshal(w.Body.Bytes(), &snapshot); err != nil || snapshot.Revision != 5 {
		t.Fatalf("snapshot %s %v", w.Body.String(), err)
	}
	w = get("/packets?limit=2&m=E", 200)
	var page telemetry.Page
	if err = json.Unmarshal(w.Body.Bytes(), &page); err != nil || len(page.Packets) != 2 || page.NextCursor == "" {
		t.Fatal("invalid first page", err)
	}
	token := page.NextCursor
	firstToken := token
	watermark := page.Watermark
	raw := []byte(`{"v":2,"id":"CS01","m":"E","n":6,"u":6,"t":0,"st":1,"fl":0,"t1":2465,"rh":0,"p1":100000,"gr":0}`)
	if _, err = service.Ingest(ctx, source, raw, telemetry.ReceiverMetadata{}); err != nil {
		t.Fatal(err)
	}
	seen := len(page.Packets)
	lastID := page.Packets[1].ID
	for token != "" {
		w = get("/packets?limit=2&m=E&cursor="+token, 200)
		page = telemetry.Page{}
		if err = json.Unmarshal(w.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		for _, packet := range page.Packets {
			if packet.ID <= lastID || packet.ID > watermark {
				t.Fatal("unstable pagination")
			}
			lastID = packet.ID
			seen++
		}
		token = page.NextCursor
	}
	if seen != 5 {
		t.Fatalf("pagination gaps %d", seen)
	}
	get("/packets?limit=0", 400)
	get("/packets?limit=201", 400)
	get("/packets?m=X", 400)
	get("/packets?cursor=bad", 400)
	get("/packets?from=tomorrow", 400)
	get("/packets?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z", 400)
	get("/packets?limit=2&limit=3", 400)
	get("/packets?m=E&bad=%zz", 400)
	get("/packets?m=I&cursor="+tokenFromPage(t, get("/packets?m=E&limit=1", 200)), 400)
	cursorRaw, err := base64.RawURLEncoding.DecodeString(firstToken)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []struct {
		key   string
		value any
	}{{"after", -1}, {"after", 1.5}, {"watermark", 1}, {"v", 2}, {"device", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}, {"watermark", 999999999}} {
		var forged map[string]any
		if err = json.Unmarshal(cursorRaw, &forged); err != nil {
			t.Fatal(err)
		}
		forged[bad.key] = bad.value
		b, _ := json.Marshal(forged)
		get("/packets?m=E&cursor="+base64.RawURLEncoding.EncodeToString(b), 400)
	}
	boundary := time.Now().UTC()
	if len(page.Packets) > 0 {
		boundary = page.Packets[len(page.Packets)-1].ReceivedAt
	}
	w = get("/packets?m=E&from="+boundary.Format(time.RFC3339Nano)+"&to="+boundary.Format(time.RFC3339Nano), 200)
	var boundaryPage telemetry.Page
	if err = json.Unmarshal(w.Body.Bytes(), &boundaryPage); err != nil || len(boundaryPage.Packets) != 1 {
		t.Fatalf("inclusive interval %s %v", w.Body.String(), err)
	}
	w = get("/packets?from="+time.Now().UTC().Add(time.Hour).Format(time.RFC3339), 200)
	if !strings.Contains(w.Body.String(), `"packets":[]`) {
		t.Fatal("interval ignored")
	}
	w = get("/packets.csv?m=E&limit=2", 200)
	records, err := csv.NewReader(strings.NewReader(w.Body.String())).ReadAll()
	if err != nil || len(records) != 3 {
		t.Fatalf("csv %s %v", w.Body.String(), err)
	}
	if w.Header().Get("X-Next-Cursor") == "" || records[0][6] != "bme680_temperature_C" || records[1][6] != "0.00" || records[1][10] != "" {
		t.Fatalf("csv units/absence/header %#v", records)
	}
	get("/packets.csv", 400)
	if _, err = pool.Exec(ctx, "INSERT INTO users(id,display_name) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','B')"); err != nil {
		t.Fatal(err)
	}
	principal = identity.Principal{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
	get("/snapshot", 404)
	get("/packets", 404)
	get("/packets.csv?m=E", 404)
	principal = a
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	request := httptest.NewRequest("GET", "http://127.0.0.1:8080"+path+"/packets.csv?m=E", nil).WithContext(cancelled)
	out := httptest.NewRecorder()
	h.ServeHTTP(out, request)
	if out.Code == 200 {
		t.Fatal("cancelled export succeeded")
	}
	// PR5 ingress requires a source credential even on the local listener.
	out = httptest.NewRecorder()
	h.ServeHTTP(out, httptest.NewRequest("POST", "http://127.0.0.1:8080/api/v1/ingestion/packets", strings.NewReader(string(raw))))
	if out.Code != 401 {
		t.Fatal("credential-free ingress exposed")
	}
	// Trusted local fixture CLI is the usable PR4 path, without exposing PR5's
	// credentialed transport endpoint. Exercise the real process and shared input.
	examples, err := os.ReadFile("../../../../packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json")
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command("go", "run", "../../cmd/server", "fixture")
	command.Stdin = strings.NewReader(string(examples))
	command.Env = append(os.Environ(), "DATABASE_URL="+url, "AUTH_MODE=local", "DEPLOYMENT_MODE=local", "LOCAL_CONTAINER=false", "LISTEN_HOST=127.0.0.1", "PORT=8080")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("fixture command %s %v", output, err)
	}
	var fixture struct {
		DeviceID   string               `json:"deviceId"`
		Projection telemetry.Projection `json:"projection"`
	}
	if err = json.Unmarshal(output, &fixture); err != nil || fixture.DeviceID == "" || fixture.Projection.Revision != 5 {
		t.Fatalf("fixture output %s %v", output, err)
	}
	path = "/api/v1/devices/" + fixture.DeviceID
	get("/snapshot", 200)
	command = exec.Command("go", "run", "../../cmd/server", "rebuild", fixture.DeviceID)
	command.Env = append(os.Environ(), "DATABASE_URL="+url, "AUTH_MODE=local", "DEPLOYMENT_MODE=local", "LOCAL_CONTAINER=false", "LISTEN_HOST=127.0.0.1", "PORT=8080")
	if output, err = command.CombinedOutput(); err != nil {
		t.Fatalf("rebuild command %s %v", output, err)
	}
	get("/snapshot", 200)
}
func tokenFromPage(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var page telemetry.Page
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	return page.NextCursor
}
