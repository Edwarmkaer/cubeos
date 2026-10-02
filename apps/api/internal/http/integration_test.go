package http_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresHTTPIsolationReadinessAndLocalIdentity(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_DATABASE_URL required")
		}
		t.Skip("TEST_DATABASE_URL required for integration")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	// This test owns an isolated database, supplied explicitly by the test runner.
	if _, err = pool.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(func(k string) string {
		if k == "DATABASE_URL" {
			return url
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	principal := identity.Principal{}
	resolver := func(ctx context.Context, r *http.Request) (identity.Principal, error) { return principal, nil }
	h := api.New(cfg, pool, devices.NewRepository(pool), resolver)
	request := func(method, path, body, origin, host string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:8080"+path, strings.NewReader(body))
		r.Host = host
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	check := func(method, path, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		w := request(method, path, body, "", "127.0.0.1:8080")
		if w.Code != want {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
		}
		return w
	}
	check("GET", "/healthz", "", 200)
	check("GET", "/readyz", "", 503)
	if err = storage.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err = storage.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	check("GET", "/readyz", "", 200)
	var wg sync.WaitGroup
	profiles := make(chan identity.Principal, 8)
	errors := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); profile, err := identity.Local(ctx, pool); profiles <- profile; errors <- err }()
	}
	wg.Wait()
	close(profiles)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var stableID string
	for profile := range profiles {
		if profile.UserID == "" {
			t.Fatal("empty local ID")
		}
		if stableID != "" && stableID != profile.UserID {
			t.Fatal("concurrent local profiles differ")
		}
		stableID = profile.UserID
	}
	var users int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users); err != nil || users != 1 {
		t.Fatalf("local profile created orphan users: %d %v", users, err)
	}
	a, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	again, err := identity.Local(ctx, pool)
	if err != nil || a != again {
		t.Fatalf("unstable profile %v %v %v", a, again, err)
	}
	principal = a
	w := check("POST", "/api/v1/devices", `{"name":"Primero","protocolDeviceId":"CS01"}`, 201)
	var d devices.Device
	if err = json.Unmarshal(w.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/devices/" + d.ID
	check("PATCH", path, `{"name":"Renombrado"}`, 200)
	w = check("GET", path, "", 200)
	if !strings.Contains(w.Body.String(), `"protocolDeviceId":"CS01"`) || !strings.Contains(w.Body.String(), "Renombrado") {
		t.Fatal(w.Body.String())
	}
	check("PATCH", path, `{"name":"Otro","protocolDeviceId":"CS02"}`, 400)
	check("POST", "/api/v1/devices", `{"name":"Segundo","protocolDeviceId":"CS01"}`, 201)
	bID := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	if _, err = pool.Exec(ctx, "INSERT INTO users(id,display_name) VALUES($1,'B')", bID); err != nil {
		t.Fatal(err)
	}
	principal = identity.Principal{UserID: bID}
	check("GET", path, "", 404)
	check("PATCH", path, `{"name":"Robado"}`, 404)
	check("DELETE", path, "", 404)
	w = check("GET", "/api/v1/devices", "", 200)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal(w.Body.String())
	}
	repo := devices.NewRepository(pool)
	if _, err = repo.Get(ctx, principal, d.ID); err != devices.ErrNotFound {
		t.Fatalf("repo get isolation %v", err)
	}
	if _, err = repo.Rename(ctx, principal, d.ID, "Robado"); err != devices.ErrNotFound {
		t.Fatalf("repo rename isolation %v", err)
	}
	if err = repo.Delete(ctx, principal, d.ID); err != devices.ErrNotFound {
		t.Fatalf("repo delete isolation %v", err)
	}
	rows, err := repo.List(ctx, principal)
	if err != nil || len(rows) != 0 {
		t.Fatalf("repo list isolation %v", err)
	}
	principal = a
	for _, v := range []struct{ origin, host string }{{"https://evil.example", "127.0.0.1:8080"}, {"null", "127.0.0.1:8080"}, {"", "evil.example:8080"}, {"http://localhost:3000", "evil.example"}} {
		if w = request("POST", "/api/v1/devices", `{"name":"Bad","protocolDeviceId":"CS01"}`, v.origin, v.host); w.Code != 403 {
			t.Fatalf("security %v: %d", v, w.Code)
		}
	}
	w = request("POST", "/api/v1/devices", `{"name":"Browser","protocolDeviceId":"CS01"}`, "http://localhost:3000", "127.0.0.1:8080")
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	check("POST", "/api/v1/devices", `{"name":"x","protocolDeviceId":"CS01"} {}`, 400)
	check("POST", "/api/v1/devices", strings.Repeat("x", 8193), 413)
	check("POST", "/api/v1/devices", `{"name":"nul\u0000name","protocolDeviceId":"CS01"}`, 400)
	check("POST", "/api/v1/devices", `null`, 400)
	check("POST", "/api/v1/devices", `{"name":"","protocolDeviceId":"CS01"}`, 400)
	check("POST", "/api/v1/devices", `{"name":"x","protocolDeviceId":"CS01","ownerUserId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}`, 400)
	for _, contentType := range []string{"text/plain", "application/x-www-form-urlencoded", ""} {
		r := httptest.NewRequest("POST", "http://127.0.0.1:8080/api/v1/devices", strings.NewReader(`{"name":"Form","protocolDeviceId":"CS01"}`))
		r.Header.Set("Content-Type", contentType)
		out := httptest.NewRecorder()
		h.ServeHTTP(out, r)
		if out.Code != 415 {
			t.Fatalf("form accepted: %s %d", contentType, out.Code)
		}
	}
	r := httptest.NewRequest("POST", "http://127.0.0.1:8080/api/v1/devices", strings.NewReader(`{"name":"Site","protocolDeviceId":"CS01"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	out := httptest.NewRecorder()
	h.ServeHTTP(out, r)
	if out.Code != 403 {
		t.Fatal("cross-site request without origin accepted")
	}
	r = httptest.NewRequest("POST", "http://127.0.0.1:8080/api/v1/devices", strings.NewReader(strings.Repeat(" ", 8193)))
	r.ContentLength = -1
	r.Header.Set("Content-Type", "application/json")
	out = httptest.NewRecorder()
	h.ServeHTTP(out, r)
	if out.Code != 413 {
		t.Fatal("chunked oversized request accepted")
	}
	check("GET", "/api/v1/devices/not-a-uuid", "", 400)
	check("DELETE", path, "", 204)
	check("GET", path, "", 404)
	pool.Close()
	check("GET", "/healthz", "", 200)
	check("GET", "/readyz", "", 503)
}
