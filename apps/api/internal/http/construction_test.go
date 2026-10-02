package http_test

import (
	"context"
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/construction"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// Catches position/account keyed completion, non-idempotent timestamps, weak body
// validation and missing backend ownership. The database is exclusive to this test.
func TestConstructionPersistedIdentityAndOwnership(t *testing.T) {
	db := os.Getenv("TEST_CONSTRUCTION_DATABASE_URL")
	if db == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_CONSTRUCTION_DATABASE_URL required")
		}
		t.Skip("exclusive construction DB required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { pool.Close() }()
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
	cfg := config.Config{Mode: "local", Port: "8080", Origin: "http://localhost:3000"}
	handler := func() http.Handler {
		return api.New(cfg, pool, devices.NewRepository(pool), func(context.Context, *http.Request) (identity.Principal, error) { return principal, nil })
	}
	h := handler()
	check := func(method, path, body string, want int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, "http://127.0.0.1:8080"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d want %d %s", method, path, w.Code, want, w.Body.String())
		}
		return w.Body.Bytes()
	}
	if strings.TrimSpace(string(check("GET", "/api/v1/steps", "", 200))) != "[]" {
		t.Fatal("production catalog must be empty")
	}
	const s1 = "11111111-1111-4111-8111-111111111111"
	const s2 = "22222222-2222-4222-8222-222222222222"
	if _, err = pool.Exec(ctx, "INSERT INTO steps(id,title,instructions,display_order) VALUES($1,'Fixture one','Test-only content',10),($2,'Fixture two','Test-only content',20)", s1, s2); err != nil {
		t.Fatal(err)
	}
	create := func(name string) string {
		var d devices.Device
		if json.Unmarshal(check("POST", "/api/v1/devices", `{"name":"`+name+`","protocolDeviceId":"CS01"}`, 201), &d) != nil {
			t.Fatal("device")
		}
		return "/api/v1/devices/" + d.ID
	}
	d1, d2 := create("First"), create("Second")
	type item struct {
		ID          string     `json:"id"`
		Completed   bool       `json:"completed"`
		CompletedAt *time.Time `json:"completedAt"`
	}
	type progress struct {
		DeviceID   string  `json:"deviceId"`
		Total      int     `json:"total"`
		Completed  int     `json:"completed"`
		Percentage float64 `json:"percentage"`
		Steps      []item  `json:"steps"`
	}
	get := func(path string) progress {
		t.Helper()
		var p progress
		if err := json.Unmarshal(check("GET", path+"/progress", "", 200), &p); err != nil {
			t.Fatal(err)
		}
		return p
	}
	before := get(d1)
	if before.Total != 2 || before.Completed != 0 || before.Percentage != 0 {
		t.Fatal(before)
	}
	check("PUT", d1+"/steps/"+s1, `{"completed":true}`, 200)
	first := get(d1)
	if first.Completed != 1 || first.Percentage != 50 || !first.Steps[0].Completed || first.Steps[0].CompletedAt == nil {
		t.Fatal(first)
	}
	saved := *first.Steps[0].CompletedAt
	check("PUT", d1+"/steps/"+s1, `{"completed":true}`, 200)
	again := get(d1)
	if !again.Steps[0].CompletedAt.Equal(saved) {
		t.Fatal("duplicate mark changed completion date")
	}
	if p := get(d2); p.Completed != 0 || p.Steps[0].CompletedAt != nil {
		t.Fatal("progress crossed devices", p)
	}
	for _, body := range []string{`{}`, `null`, `{"completed":null}`, `{"completed":1}`, `{"completed":"true"}`, `{"Completed":true}`, `{"completed":true,"extra":1}`, `{"completed":true,"completed":false}`, `{"completed":true} {}`} {
		check("PUT", d1+"/steps/"+s1, body, 400)
	}
	check("PUT", d1+"/steps/33333333-3333-4333-8333-333333333333", `{"completed":true}`, 404)
	check("PUT", d1+"/steps/bad", `{"completed":true}`, 400)
	b := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	if _, err = pool.Exec(ctx, "INSERT INTO users(id,display_name) VALUES($1,'B')", b); err != nil {
		t.Fatal(err)
	}
	principal = identity.Principal{UserID: b}
	repo := construction.NewRepository(pool)
	if _, err = repo.Get(ctx, principal, strings.TrimPrefix(d1, "/api/v1/devices/")); err != devices.ErrNotFound {
		t.Fatal("repository read ownership", err)
	}
	if _, err = repo.Set(ctx, principal, strings.TrimPrefix(d1, "/api/v1/devices/"), s1, false); err != devices.ErrNotFound {
		t.Fatal("repository write ownership", err)
	}
	check("GET", d1+"/progress", "", 404)
	check("PUT", d1+"/steps/"+s1, `{"completed":false}`, 404)
	principal = identity.Principal{}
	check("GET", "/api/v1/steps", "", 401)
	check("GET", d1+"/progress", "", 401)
	principal = a
	// Total is derived; adding an actual catalog row changes the denominator.
	const s3 = "33333333-3333-4333-8333-333333333333"
	if _, err = pool.Exec(ctx, "INSERT INTO steps(id,title,instructions,display_order) VALUES($1,'Fixture three','Test-only content',40)", s3); err != nil {
		t.Fatal(err)
	}
	added := get(d1)
	if added.Total != 3 || added.Completed != 1 || added.Percentage < 33.33 || added.Percentage > 33.34 {
		t.Fatal("percentage not derived", added)
	}
	if _, err = pool.Exec(ctx, "DELETE FROM steps WHERE id=$1", s3); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "UPDATE steps SET display_order=CASE WHEN id=$1 THEN 30 ELSE 5 END", s1); err != nil {
		t.Fatal(err)
	}
	reordered := get(d1)
	if reordered.Steps[0].ID != s2 || reordered.Steps[0].Completed || reordered.Steps[1].ID != s1 || !reordered.Steps[1].Completed {
		t.Fatal("reorder moved completion", reordered)
	}
	// Reopen the actual pool and HTTP handler; persisted profile and dates survive.
	pool.Close()
	pool, err = pgxpool.New(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	persisted, err := identity.Local(ctx, pool)
	if err != nil || persisted != a {
		t.Fatal("profile changed", err)
	}
	h = handler()
	p := get(d1)
	if p.Percentage != 50 || !p.Steps[1].CompletedAt.Equal(saved) {
		t.Fatal("restart lost progress", p)
	}
	check("PUT", d1+"/steps/"+s1, `{"completed":false}`, 200)
	check("PUT", d1+"/steps/"+s1, `{"completed":false}`, 200)
	p = get(d1)
	if p.Completed != 0 || p.Percentage != 0 || p.Steps[1].CompletedAt != nil {
		t.Fatal("unmark incoherent", p)
	}
	check("PUT", d1+"/steps/"+s1, "{\n \"completed\" : true\n}", 200)
	p = get(d1)
	if p.Steps[1].CompletedAt == nil || !p.Steps[1].CompletedAt.After(saved) {
		t.Fatal("remark must get new date", p)
	}
	r := httptest.NewRequest("OPTIONS", "http://127.0.0.1:8080"+d1+"/steps/"+s1, nil)
	r.Header.Set("Origin", cfg.Origin)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 204 || !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PUT") {
		t.Fatal("PUT preflight")
	}
}
