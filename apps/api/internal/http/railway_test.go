package http_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRailwayReadinessHostDoesNotGrantDataAccess(t *testing.T) {
	db := os.Getenv("TEST_RAILWAY_DATABASE_URL")
	if db == "" {
		if os.Getenv("RECOVERY_REQUIRED") == "1" {
			t.Fatal("Railway test DB required")
		}
		t.Skip("exclusive Railway DB required")
	}
	ctx := context.Background()
	p, e := pgxpool.New(ctx, db)
	if e != nil {
		t.Fatal(e)
	}
	defer p.Close()
	if _, e = p.Exec(ctx, "DROP SCHEMA public CASCADE;CREATE SCHEMA public"); e != nil {
		t.Fatal(e)
	}
	vars := map[string]string{"DATABASE_URL": db, "DEPLOYMENT_MODE": "public", "AUTH_MODE": "clerk", "PUBLIC_API_HOST": "api.example", "ALLOWED_ORIGIN": "https://web.example", "CLERK_ISSUER": "https://auth.example", "CLERK_JWKS_URL": "https://auth.example/.well-known/jwks.json", "CLERK_AUDIENCE": "cubeos", "CLERK_SECRET_KEY": "fixture", "MEDIA_STORAGE": "s3", "MEDIA_S3_ENDPOINT": "https://objects.example", "MEDIA_S3_REGION": "test", "MEDIA_S3_BUCKET": "private", "MEDIA_S3_ACCESS_KEY": "fixture", "MEDIA_S3_SECRET_KEY": "fixture", "RAILWAY_HEALTHCHECK": "true"}
	c, e := config.Load(func(k string) string { return vars[k] })
	if e != nil {
		t.Fatal(e)
	}
	h := api.NewWithMedia(c, p, devices.NewRepository(p), nil, func(context.Context, *http.Request) (identity.Principal, error) {
		return identity.Principal{}, identity.ErrUnauthorized
	}, nil, nil)
	check := func(method, path, host, origin string, want int) {
		t.Helper()
		r := httptest.NewRequest(method, "http://"+host+path, nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("X-Forwarded-Host", "api.example")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s %s got %d want %d", method, path, host, w.Code, want)
		}
	}
	check("GET", "/readyz", "healthcheck.railway.app", "", 503)
	if e = storage.Migrate(ctx, p); e != nil {
		t.Fatal(e)
	}
	check("GET", "/readyz", "healthcheck.railway.app", "", 200)
	check("GET", "/api/v1/devices", "healthcheck.railway.app", "", 403)
	check("GET", "/readyz", "evil.example", "", 403)
	check("GET", "/readyz", "healthcheck.railway.app", "https://evil.example", 403)
	check("POST", "/readyz", "healthcheck.railway.app", "", 403)
	check("GET", "/api/v1/devices", "api.example", "https://web.example", 401)
}
