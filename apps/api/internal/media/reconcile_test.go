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
	"os"
	"testing"
)

func TestMediaReconcileDoesNotStarveAfter100MissingOriginals(t *testing.T) {
	db := os.Getenv("TEST_MEDIA_SERVICE_DATABASE_URL")
	if db == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("media PG required")
		}
		t.Skip("exclusive media PG")
	}
	ctx := context.Background()
	p, err := pgxpool.New(ctx, db)
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
	d, err := devices.NewRepository(p).Create(ctx, user, devices.Input{Name: "Reconciliation", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{MediaStorage: "local", MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
	store, err := objects.NewLocal(cfg.MediaLocalRoot)
	if err != nil {
		t.Fatal(err)
	}
	s := New(p, store, cfg)
	photo, err := s.Upload(ctx, Access{Principal: user}, d.ID, bytes.NewReader(testPNG()), "image/png", nil, "manual")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(ctx, `INSERT INTO photos(id,device_id,storage_backend,original_key,content_type,size_bytes,width_px,height_px,sha256,import_method,imported_at) SELECT id,$1,'local','photos/'||id::text||'/original','image/png',1,1,1,repeat('0',64),'manual',clock_timestamp()-interval '1 day' FROM (SELECT gen_random_uuid() id FROM generate_series(1,100)) ids`, d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(ctx, "UPDATE photos SET status='pending' WHERE id=$1", photo.ID); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = s.Reconcile(ctx, 0); err != nil {
			t.Fatal(err)
		}
	}
	result, err := s.Get(ctx, user, photo.ID)
	if err != nil || result.Status != "ready" {
		t.Fatal("recoverable photo starved behind old interrupted metadata", result.Status, err)
	}
}
