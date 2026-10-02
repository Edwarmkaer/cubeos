package http_test

import (
	"context"
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/testutil/authfixture"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestConstructionSignedBrowser(t *testing.T) {
	if os.Getenv("CUBEOS_CONSTRUCTION_BROWSER") != "1" {
		t.Skip("separate browser gate")
	}
	db := os.Getenv("TEST_CONSTRUCTION_BROWSER_DATABASE_URL")
	if db == "" {
		t.Fatal("exclusive browser DB required")
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
	if _, err = pool.Exec(ctx, "INSERT INTO steps(id,title,instructions,display_order) VALUES('11111111-1111-4111-8111-111111111111','Fixture one','Test-only content',1),('22222222-2222-4222-8222-222222222222','Fixture two','Test-only content',2)"); err != nil {
		t.Fatal(err)
	}
	provider := authfixture.New(t)
	origin := "http://localhost:3128"
	server := httptest.NewUnstartedServer(nil)
	server.StartTLS()
	defer server.Close()
	u, _ := url.Parse(server.URL)
	cfg := config.Config{Mode: "public", PublicAPIHost: u.Host, Origin: origin}
	resolver := provider.Resolver(pool, origin)
	server.Config.Handler = api.New(cfg, pool, devices.NewRepository(pool), resolver.Resolve)
	raw, _ := json.Marshal(map[string]string{"apiURL": server.URL, "origin": origin, "a": provider.Token(t, "user_A", origin, 5*time.Minute, nil), "b": provider.Token(t, "user_B", origin, 5*time.Minute, nil)})
	cmd := exec.Command("node", "../../../web/tests/browser-construction.mjs")
	cmd.Stdin = strings.NewReader(string(raw))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		t.Fatal("construction browser", err)
	}
}
