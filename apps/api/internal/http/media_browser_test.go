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
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/testutil/authfixture"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/png"
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
	server.Config.Handler = api.New(cfg, pool, devices.NewRepository(pool), resolver.Resolve)
	var original bytes.Buffer
	png.Encode(&original, image.NewNRGBA(image.Rect(0, 0, 12, 7)))
	raw, _ := json.Marshal(map[string]string{"apiURL": server.URL, "origin": origin, "a": provider.Token(t, "user_A", origin, 5*time.Minute, nil), "b": provider.Token(t, "user_B", origin, 5*time.Minute, nil), "original": base64.StdEncoding.EncodeToString(original.Bytes())})
	cmd := exec.Command("node", "../../../web/tests/browser-media.mjs")
	cmd.Stdin = strings.NewReader(string(raw))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		t.Fatal("media browser", err)
	}
}
