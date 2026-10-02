package http_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/media"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/testutil/authfixture"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestMediaSignedBrowser(t *testing.T) {
	if os.Getenv("CUBEOS_MEDIA_BROWSER") != "1" {
		t.Skip("separate media browser gate")
	}
	db := os.Getenv("TEST_MEDIA_BROWSER_DATABASE_URL")
	if db == "" {
		t.Fatal("exclusive media browser PG required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, db)
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
	for _, subject := range []string{"user_A", "user_B"} {
		if _, err = identity.Enroll(ctx, pool, subject, subject); err != nil {
			t.Fatal(err)
		}
	}
	provider := authfixture.New(t)
	origin := "http://localhost:3134"
	server := httptest.NewUnstartedServer(nil)
	server.StartTLS()
	defer server.Close()
	u, _ := url.Parse(server.URL)
	cfg := config.Config{Mode: "public", PublicAPIHost: u.Host, Origin: origin, MediaStorage: "local", MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
	resolver := provider.Resolver(pool, origin)
	objectStore, err := media.Configure(cfg)
	if err != nil {
		t.Fatal(err)
	}
	operator := media.New(pool, objectStore, cfg)
	production := api.New(cfg, pool, devices.NewRepository(pool), resolver.Resolve)
	// Test-only operator bridge; never a production API route. Browser exercises
	// missing-file races against real storage, then asks the real reconciler to run.
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fixture/media-revoke-session" && r.Method == "POST" {
			if _, e := resolver.Resolve(r.Context(), r); e != nil {
				w.WriteHeader(401)
				return
			}
			provider.Revoke("sess_A")
			w.WriteHeader(204)
			return
		}
		if r.URL.Path == "/fixture/media-reconcile" && r.Method == "POST" {
			if _, e := resolver.Resolve(r.Context(), r); e != nil {
				w.WriteHeader(401)
				return
			}
			if e := operator.Reconcile(r.Context(), 0); e != nil {
				w.WriteHeader(503)
				return
			}
			w.WriteHeader(204)
			return
		}
		production.ServeHTTP(w, r)
	})
	var original bytes.Buffer
	png.Encode(&original, image.NewNRGBA(image.Rect(0, 0, 12, 7)))
	raw, _ := json.Marshal(map[string]string{"apiURL": server.URL, "origin": origin, "a": provider.Token(t, "user_A", origin, 5*time.Minute, nil), "b": provider.Token(t, "user_B", origin, 5*time.Minute, nil), "original": base64.StdEncoding.EncodeToString(original.Bytes()), "mediaRoot": cfg.MediaLocalRoot})
	cmd := exec.Command("node", "../../../web/tests/browser-media.mjs")
	cmd.Stdin = strings.NewReader(string(raw))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		t.Fatal("media browser", err)
	}
}
