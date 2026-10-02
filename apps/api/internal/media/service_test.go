package media

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	dbstorage "github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

type faultStore struct {
	objects.ObjectStore
	thumb, original bool
}

func (s *faultStore) Put(ctx context.Context, key string, r io.Reader, mime string) error {
	if s.thumb && mime == "image/jpeg" || s.original && mime == "image/png" {
		return errors.New("storage unavailable")
	}
	return s.ObjectStore.Put(ctx, key, r, mime)
}

type interrupted struct{}

func (interrupted) Read([]byte) (int, error) { return 0, errors.New("upload cut") }

// Real DB commit failure, missing object, and thumbnail failure must not lie about ready.
func TestMediaServiceFailuresReconcileAndRetry(t *testing.T) {
	t.Run("local", func(t *testing.T) { mediaFailureContract(t, "local") })
	t.Run("s3", func(t *testing.T) {
		if os.Getenv("TEST_S3_ENDPOINT") == "" {
			if os.Getenv("TEST_MEDIA_REQUIRED") == "1" {
				t.Fatal("real S3 required")
			}
			t.Skip("separate S3 gate")
		}
		mediaFailureContract(t, "s3")
	})
}
func mediaFailureContract(t *testing.T, backend string) {
	url := os.Getenv("TEST_MEDIA_SERVICE_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("media service PG required")
		}
		t.Skip("exclusive media service PG required")
	}
	ctx := context.Background()
	p, err := pgxpool.New(ctx, url)
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
	d, err := devices.NewRepository(p).Create(ctx, user, devices.Input{Name: "Recovery", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{MediaStorage: "local", MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
	cfg.MediaStorage = backend
	cfg.MediaEndpoint = os.Getenv("TEST_S3_ENDPOINT")
	cfg.MediaRegion = "us-east-1"
	cfg.MediaBucket = os.Getenv("TEST_S3_BUCKET")
	cfg.MediaAccessKey = os.Getenv("TEST_S3_ACCESS_KEY")
	cfg.MediaSecretKey = os.Getenv("TEST_S3_SECRET_KEY")
	local, err := Configure(cfg)
	if err != nil {
		t.Fatal(err)
	}
	fs := &faultStore{ObjectStore: local}
	s := New(p, fs, cfg)
	access := Access{Principal: user}
	raw := testPNG()
	if _, err = s.Upload(ctx, access, d.ID, interrupted{}, "image/png", nil, "manual"); err == nil {
		t.Fatal("cut accepted")
	}
	var count int
	p.QueryRow(ctx, "SELECT count(*) FROM photos").Scan(&count)
	if count != 0 {
		t.Fatal("interrupted metadata", count)
	}
	small := cfg
	small.MediaMaxBytes = int64(len(raw) - 1)
	if _, err = New(p, fs, small).Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual"); !errors.Is(err, ErrLimit) {
		t.Fatal("byte limit", err)
	}
	fs.thumb = true
	photo, err := s.Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual")
	if err != nil || photo.Status != "ready" || photo.HasThumbnail {
		t.Fatal(photo, err)
	}
	fs.thumb = false
	if err = s.Reconcile(ctx, 0); err != nil {
		t.Fatal(err)
	}
	photo, err = s.Get(ctx, user, photo.ID)
	if err != nil || !photo.HasThumbnail {
		t.Fatal("thumbnail retry", photo, err)
	}
	// Losing only the derivative must not poison original readiness or prevent
	// direct reconciliation, thumbnail GET repair, or list repair on either store.
	for _, detect := range []string{"reconcile", "open", "list"} {
		if err = local.Delete(ctx, photo.ThumbnailKey); err != nil {
			t.Fatal(err)
		}
		switch detect {
		case "open":
			if _, _, err = s.Open(ctx, user, photo.ID, true); !errors.Is(err, devices.ErrNotFound) {
				t.Fatal("missing derivative GET", err)
			}
		case "list":
			page, e := s.List(ctx, user, d.ID, 20, "")
			if e != nil {
				t.Fatal(e)
			}
			for _, listed := range page.Items {
				if listed.ID == photo.ID && (listed.HasThumbnail || listed.Status != "ready") {
					t.Fatal("stale derivative list", listed)
				}
			}
		}
		if detect != "reconcile" {
			metadata, e := s.Get(ctx, user, photo.ID)
			if e != nil || metadata.HasThumbnail || metadata.Status != "ready" {
				t.Fatal("missing derivative metadata", metadata, e)
			}
		}
		if err = s.Reconcile(ctx, 0); err != nil {
			t.Fatal(err)
		}
		photo, err = s.Get(ctx, user, photo.ID)
		if err != nil || !photo.HasThumbnail || photo.Status != "ready" {
			t.Fatal("derivative recovery metadata", photo, err)
		}
		_, thumbnail, e := s.Open(ctx, user, photo.ID, true)
		if e != nil {
			t.Fatal("derivative still missing after reconcile", detect, e)
		}
		thumbnail.Close()
		_, original, e := s.Open(ctx, user, photo.ID, false)
		if e != nil {
			t.Fatal(e)
		}
		got, e := io.ReadAll(original)
		original.Close()
		if e != nil || !bytes.Equal(got, raw) {
			t.Fatal("derivative recovery changed original", e)
		}
	}
	fs.original = true
	if _, err = s.Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual"); err == nil {
		t.Fatal("storage error")
	}
	fs.original = false
	var pendingID string
	if err = p.QueryRow(ctx, "SELECT id::text FROM photos WHERE status='pending'").Scan(&pendingID); err != nil {
		t.Fatal(err)
	}
	if err = s.Reconcile(ctx, 0); err != nil {
		t.Fatal(err)
	}
	pending, _ := s.Get(ctx, user, pendingID)
	if pending.Status != "pending" {
		t.Fatal("missing original ready")
	}
	// A commit error after the durable PUT leaves only pending evidence.
	if _, err = p.Exec(ctx, `CREATE FUNCTION fail_ready() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='ready' THEN RAISE EXCEPTION 'test commit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_ready BEFORE UPDATE ON photos FOR EACH ROW EXECUTE FUNCTION fail_ready()`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual"); err == nil {
		t.Fatal("failed metadata commit returned success")
	}
	p.Exec(ctx, "DROP TRIGGER fail_ready ON photos; DROP FUNCTION fail_ready()")
	if err = s.Reconcile(ctx, 0); err != nil {
		t.Fatal(err)
	}
	page, err := s.List(ctx, user, d.ID, 20, "")
	if err != nil {
		t.Fatal(err)
	}
	ready := 0
	for _, v := range page.Items {
		if v.Status == "ready" {
			ready++
			_, r, e := s.Open(ctx, user, v.ID, false)
			if e != nil {
				t.Fatal(e)
			}
			got, _ := io.ReadAll(r)
			r.Close()
			if !bytes.Equal(got, raw) {
				t.Fatal("recovery changed bytes")
			}
		}
	}
	if ready != 2 {
		t.Fatal("recovered ready", ready)
	}
	// Metadata insert failure must not leave any untracked original.
	if _, err = p.Exec(ctx, `CREATE FUNCTION fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$; CREATE TRIGGER fail_insert BEFORE INSERT ON photos FOR EACH ROW EXECUTE FUNCTION fail_insert()`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual"); err == nil {
		t.Fatal("DB failure accepted")
	}
	p.Exec(ctx, "DROP TRIGGER fail_insert ON photos; DROP FUNCTION fail_insert()")
	// Missing original cannot remain ready in a list or be downloaded.
	local.Delete(ctx, photo.OriginalKey)
	page, err = s.List(ctx, user, d.ID, 20, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range page.Items {
		if v.ID == photo.ID && v.Status != "pending" {
			t.Fatal("missing ready")
		}
	}
	if _, _, err = s.Open(ctx, user, photo.ID, false); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal(err)
	}
	if _, err = s.Upload(ctx, access, d.ID, bytes.NewReader(raw), "image/png", nil, "manual"); err != nil {
		t.Fatal("retry", err)
	}
	// Reconciliation owns only recognized staging names and never unrelated files.
	stale := cfg.MediaTempRoot + "/stage-33333333-3333-4333-8333-333333333333"
	os.WriteFile(stale, []byte("cut"), 0600)
	os.Chtimes(stale, time.Now().Add(-48*time.Hour), time.Now().Add(-48*time.Hour))
	unrelated := cfg.MediaTempRoot + "/keep-user-file"
	os.WriteFile(unrelated, []byte("keep"), 0600)
	if err = s.Reconcile(ctx, 0); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("stale staging", err)
	}
	if _, err = os.Stat(unrelated); err != nil {
		t.Fatal("unrelated removed", err)
	}
}
