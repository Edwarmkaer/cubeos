package media

import (
	"bytes"
	"context"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	dbstorage "github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

type gatedOpen struct {
	objects.ObjectStore
	gate  chan struct{}
	ready chan struct{}
	count atomic.Int32
}

func (g *gatedOpen) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if g.count.Add(1) == 2 {
		close(g.ready)
	}
	select {
	case <-g.gate:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return g.ObjectStore.Open(ctx, key)
}
func TestMediaConcurrentMissingListsReleaseDatabaseConnections(t *testing.T) {
	db := os.Getenv("TEST_MEDIA_SERVICE_DATABASE_URL")
	if db == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("media PG required")
		}
		t.Skip("exclusive media PG")
	}
	ctx := context.Background()
	pc, err := pgxpool.ParseConfig(db)
	if err != nil {
		t.Fatal(err)
	}
	pc.MaxConns = 2
	p, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	p.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public")
	if err = dbstorage.Migrate(ctx, p); err != nil {
		t.Fatal(err)
	}
	user, err := identity.Local(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	d, err := devices.NewRepository(p).Create(ctx, user, devices.Input{Name: "Lists", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{MediaStorage: "local", MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
	local, err := objects.NewLocal(cfg.MediaLocalRoot)
	if err != nil {
		t.Fatal(err)
	}
	s := New(p, local, cfg)
	photo, err := s.Upload(ctx, Access{Principal: user}, d.ID, bytes.NewReader(testPNG()), "image/png", nil, "manual")
	if err != nil {
		t.Fatal(err)
	}
	local.Delete(ctx, photo.OriginalKey)
	g := &gatedOpen{ObjectStore: local, gate: make(chan struct{}), ready: make(chan struct{})}
	s = New(p, g, cfg)
	bounded, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	results := make(chan error, 2)
	for range 2 {
		go func() { _, e := s.List(bounded, user, d.ID, 20, ""); results <- e }()
	}
	select {
	case <-g.ready:
	case <-bounded.Done():
		close(g.gate)
		t.Fatal("lists did not reach object service")
	}
	close(g.gate)
	for range 2 {
		if err = <-results; err != nil {
			t.Fatal("connection exhaustion while demoting missing objects", err)
		}
	}
}
