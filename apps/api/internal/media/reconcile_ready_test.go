package media

import (
	"bytes"
	"context"
	"errors"
	"os"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	dbstorage "github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Expanding the audit to ready rows must rotate healthy candidates and respect
// the same real PostgreSQL photo lock held by uploads on another API process.
func TestMediaReconcileReadyRowsRotateAndRespectActivePhotoLock(t *testing.T) {
	for _, backend := range []string{"local", "s3"} {
		t.Run(backend, func(t *testing.T) {
			db := os.Getenv("TEST_MEDIA_SERVICE_DATABASE_URL")
			if db == "" {
				if os.Getenv("CI") != "" {
					t.Fatal("exclusive media PG required")
				}
				t.Skip("exclusive media PG required")
			}
			if backend == "s3" && os.Getenv("TEST_S3_ENDPOINT") == "" {
				if os.Getenv("TEST_MEDIA_REQUIRED") == "1" {
					t.Fatal("actual S3 required")
				}
				t.Skip("separate S3 gate")
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
			if err = dbstorage.Migrate(ctx, pool); err != nil {
				t.Fatal(err)
			}
			owner, err := identity.Local(ctx, pool)
			if err != nil {
				t.Fatal(err)
			}
			device, err := devices.NewRepository(pool).Create(ctx, owner, devices.Input{Name: "Ready audit", ProtocolDeviceID: "CS01"})
			if err != nil {
				t.Fatal(err)
			}
			cfg := config.Config{MediaStorage: backend, MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000, MediaEndpoint: os.Getenv("TEST_S3_ENDPOINT"), MediaRegion: "us-east-1", MediaBucket: os.Getenv("TEST_S3_BUCKET"), MediaAccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), MediaSecretKey: os.Getenv("TEST_S3_SECRET_KEY")}
			store, err := Configure(cfg)
			if err != nil {
				t.Fatal(err)
			}
			service := New(pool, store, cfg)
			raw := testPNG()
			for range 100 {
				if _, err = service.Upload(ctx, Access{Principal: owner}, device.ID, bytes.NewReader(raw), "image/png", nil, "manual"); err != nil {
					t.Fatal(err)
				}
			}
			victim, err := service.Upload(ctx, Access{Principal: owner}, device.ID, bytes.NewReader(raw), "image/png", nil, "manual")
			if err != nil {
				t.Fatal(err)
			}
			if err = store.Delete(ctx, victim.ThumbnailKey); err != nil {
				t.Fatal(err)
			}
			active, err := pool.Acquire(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer active.Release()
			if _, err = active.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,20261010))", victim.ID); err != nil {
				t.Fatal(err)
			}
			for range 2 {
				if err = service.Reconcile(ctx, 0); err != nil {
					t.Fatal(err)
				}
			}
			if r, e := store.Open(ctx, victim.ThumbnailKey); !errors.Is(e, objects.ErrNotFound) {
				if r != nil {
					r.Close()
				}
				t.Fatal("reconciler changed a locked derivative", e)
			}
			if _, err = active.Exec(ctx, "SELECT pg_advisory_unlock(hashtextextended($1,20261010))", victim.ID); err != nil {
				t.Fatal(err)
			}
			if err = service.Reconcile(ctx, 0); err != nil {
				t.Fatal(err)
			}
			got, reader, err := service.Open(ctx, owner, victim.ID, true)
			if err != nil {
				t.Fatal("healthy ready rows starved missing derivative", err)
			}
			reader.Close()
			if got.Status != "ready" || !got.HasThumbnail || got.SHA256 != victim.SHA256 {
				t.Fatal("audit changed original metadata", got)
			}
		})
	}
}
