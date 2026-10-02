package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"os/exec"
	"testing"
	"time"
)

// Real persistent volumes. Deliberately serial and opt-in; never restarts other resources.
func TestMediaS3PersistedRestart(t *testing.T) {
	if os.Getenv("CUBEOS_MEDIA_RESTART") != "1" {
		t.Skip("serial owned-volume restart gate")
	}
	db := os.Getenv("TEST_MEDIA_RESTART_DATABASE_URL")
	if db == "" {
		t.Fatal("exclusive media restart PG required")
	}
	pg, s3 := os.Getenv("CUBEOS_MEDIA_PG_CONTAINER"), os.Getenv("CUBEOS_MEDIA_S3_CONTAINER")
	if (pg != "cubeos-pr10-test-pg" && pg != "cubeos-media-pg") || (s3 != "cubeos-pr10-test-s3" && s3 != "cubeos-media-s3") {
		t.Fatal("refuse unrelated containers")
	}
	ctx := context.Background()
	var pool *pgxpool.Pool
	var server *httptest.Server
	cfg := config.Config{Mode: "local", Origin: "http://localhost:3133", MediaStorage: "s3", MediaEndpoint: os.Getenv("TEST_S3_ENDPOINT"), MediaRegion: "us-east-1", MediaBucket: os.Getenv("TEST_S3_BUCKET"), MediaAccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), MediaSecretKey: os.Getenv("TEST_S3_SECRET_KEY"), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
	start := func() {
		var e error
		pool, e = pgxpool.New(ctx, db)
		if e != nil {
			t.Fatal(e)
		}
		server = httptest.NewServer(nil)
		u, _ := url.Parse(server.URL)
		cfg.Port = u.Port()
		server.Config.Handler = api.New(cfg, pool, devices.NewRepository(pool), func(c context.Context, _ *http.Request) (identity.Principal, error) { return identity.Local(c, pool) })
	}
	start()
	defer func() { server.Close(); pool.Close() }()
	if _, err := pool.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	if err := storage.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	p, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	d, err := devices.NewRepository(pool).Create(ctx, p, devices.Input{Name: "Restart", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	var raw bytes.Buffer
	png.Encode(&raw, image.NewNRGBA(image.Rect(0, 0, 7, 11)))
	original := raw.Bytes()
	var body bytes.Buffer
	m := multipart.NewWriter(&body)
	part, _ := m.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="copied.png"`}, "Content-Type": {"image/png"}})
	part.Write(original)
	m.Close()
	response, err := http.Post(server.URL+"/api/v1/devices/"+d.ID+"/photos", m.FormDataContentType(), &body)
	if err != nil {
		t.Fatal(err)
	}
	var photo struct{ ID, SHA256, Status string }
	json.NewDecoder(response.Body).Decode(&photo)
	response.Body.Close()
	if response.StatusCode != 201 || photo.Status != "ready" {
		t.Fatal("upload", response.StatusCode)
	}
	get := func(want int) []byte {
		t.Helper()
		client := http.Client{Timeout: 30 * time.Second}
		response, e := client.Get(server.URL + "/api/v1/photos/" + photo.ID + "/original")
		if e != nil {
			t.Fatal(e)
		}
		defer response.Body.Close()
		v, e := io.ReadAll(response.Body)
		if e != nil {
			t.Fatal(e)
		}
		if response.StatusCode != want {
			t.Fatal("download", response.StatusCode)
		}
		return v
	}
	if !bytes.Equal(get(200), original) {
		t.Fatal("before restart")
	}
	docker := func(args ...string) {
		t.Helper()
		output, e := exec.Command("docker", args...).CombinedOutput()
		if e != nil {
			t.Fatalf("owned service command %v %s", e, output)
		}
	}
	// Storage outage is an actual stopped service, not an SDK mock.
	docker("stop", s3)
	get(503)
	docker("start", s3)
	server.Close()
	pool.Close()
	docker("restart", pg, s3)
	for i := 0; i < 100; i++ {
		if exec.Command("docker", "exec", pg, "pg_isready", "-U", "postgres").Run() == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	start()
	var afterSHA string
	if err = pool.QueryRow(ctx, "SELECT sha256 FROM photos WHERE id=$1", photo.ID).Scan(&afterSHA); err != nil || afterSHA != photo.SHA256 {
		t.Fatal("persisted metadata", err)
	}
	for i := 0; i < 100; i++ {
		r, e := http.Get(cfg.MediaEndpoint + "/health")
		if e == nil {
			r.Body.Close()
			if r.StatusCode == 200 {
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !bytes.Equal(get(200), original) {
		t.Fatal("bytes lost after API/DB/object restart")
	}
}
