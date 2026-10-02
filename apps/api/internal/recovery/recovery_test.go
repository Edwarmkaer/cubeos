package recovery

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/media"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	dbstorage "github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"net/url"
)

// Removing data from the dump, skipping object verification, or permitting an
// occupied destination must break this real PostgreSQL + filesystem/S3 contract.
func TestRecoveryRoundTripAndRefusals(t *testing.T) {
	adminURL := os.Getenv("TEST_RECOVERY_DATABASE_URL")
	if adminURL == "" {
		if os.Getenv("RECOVERY_REQUIRED") == "1" {
			t.Fatal("recovery PostgreSQL required")
		}
		t.Skip("exclusive recovery PostgreSQL required")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, adminURL)
	if e != nil {
		t.Fatal("admin connection")
	}
	defer admin.Close()
	for _, backend := range []string{"local", "s3"} {
		t.Run(backend, func(t *testing.T) {
			if backend == "s3" && os.Getenv("TEST_S3_ENDPOINT") == "" {
				t.Fatal("real private S3 required")
			}
			db := func(prefix string) string {
				name := prefix + uuid.NewString()
				name = string(bytes.ReplaceAll([]byte(name), []byte("-"), []byte("")))
				if _, e := admin.Exec(ctx, `CREATE DATABASE "`+name+`"`); e != nil {
					t.Fatal("create disposable database")
				}
				u, _ := url.Parse(adminURL)
				u.Path = "/" + name
				return u.String()
			}
			sourceURL := db("cubeos_backup_")
			targetURL := db("cubeos_restore_")
			cfg := config.Config{MediaStorage: backend, MediaLocalRoot: t.TempDir(), MediaTempRoot: t.TempDir(), MediaMaxBytes: 64 << 20, MediaMaxPixels: 80_000_000}
			makeStore := func(c *config.Config, prefix string) Inventory {
				if backend == "local" {
					s, e := objects.NewLocal(c.MediaLocalRoot)
					if e != nil {
						t.Fatal(e)
					}
					return s
				}
				u, _ := url.Parse(os.Getenv("TEST_S3_ENDPOINT"))
				client, e := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("TEST_S3_ACCESS_KEY"), os.Getenv("TEST_S3_SECRET_KEY"), ""), Secure: u.Scheme == "https", Region: "us-east-1"})
				if e != nil {
					t.Fatal("S3 client")
				}
				c.MediaEndpoint = u.String()
				c.MediaRegion = "us-east-1"
				c.MediaBucket = prefix + uuid.NewString()
				c.MediaAccessKey = os.Getenv("TEST_S3_ACCESS_KEY")
				c.MediaSecretKey = os.Getenv("TEST_S3_SECRET_KEY")
				if e = client.MakeBucket(ctx, c.MediaBucket, minio.MakeBucketOptions{Region: "us-east-1"}); e != nil {
					t.Fatal("private bucket creation")
				}
				s, e := objects.NewS3(objects.S3Config{Endpoint: c.MediaEndpoint, Region: c.MediaRegion, Bucket: c.MediaBucket, AccessKey: c.MediaAccessKey, SecretKey: c.MediaSecretKey, TempRoot: c.MediaTempRoot})
				if e != nil {
					t.Fatal(e)
				}
				return s
			}
			source := makeStore(&cfg, "cubeos-backup-")
			p, e := pgxpool.New(ctx, sourceURL)
			if e != nil {
				t.Fatal(e)
			}
			if e = dbstorage.Migrate(ctx, p); e != nil {
				t.Fatal(e)
			}
			a, e := identity.Local(ctx, p)
			if e != nil {
				t.Fatal(e)
			}
			var b identity.Principal
			if e = p.QueryRow(ctx, "INSERT INTO users(display_name) VALUES('B') RETURNING id::text").Scan(&b.UserID); e != nil {
				t.Fatal(e)
			}
			d, e := devices.NewRepository(p).Create(ctx, a, devices.Input{Name: "A", ProtocolDeviceID: "CS01"})
			if e != nil {
				t.Fatal(e)
			}
			other, e := devices.NewRepository(p).Create(ctx, b, devices.Input{Name: "B", ProtocolDeviceID: "CS01"})
			if e != nil {
				t.Fatal(e)
			}
			step := uuid.NewString()
			if _, e = p.Exec(ctx, "INSERT INTO steps VALUES($1,'Fixture only','Fixture only',0);", step); e != nil {
				t.Fatal(e)
			}
			if _, e = p.Exec(ctx, "INSERT INTO step_progress(device_id,step_id) VALUES($1,$2)", d.ID, step); e != nil {
				t.Fatal(e)
			}
			var sourceID string
			if e = p.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',$2) RETURNING id::text", d.ID, fmt.Sprintf("%x", sha256.Sum256([]byte("fixture source")))).Scan(&sourceID); e != nil {
				t.Fatal(e)
			}
			service := ingestion.NewService(ingestion.NewRepository(p))
			raw := []byte(`{"v":2,"id":"CS01","m":"E","n":1,"u":1000,"t":0,"st":1,"fl":0,"t1":2465,"rh":5120,"p1":101325,"gr":20000}`)
			result, e := service.Ingest(ctx, sourceID, raw, telemetry.ReceiverMetadata{})
			if e != nil || result.Status != "accepted" {
				t.Fatal(result, e)
			}
			if _, e = service.Ingest(ctx, sourceID, []byte("bad raw"), telemetry.ReceiverMetadata{}); e != nil {
				t.Fatal(e)
			}
			photos := media.New(p, source, cfg)
			if _, e = photos.CreateCredential(ctx, a, d.ID); e != nil {
				t.Fatal(e)
			}
			var data bytes.Buffer
			png.Encode(&data, image.NewNRGBA(image.Rect(0, 0, 12, 9)))
			photo, e := photos.Upload(ctx, media.Access{Principal: a}, d.ID, bytes.NewReader(data.Bytes()), "image/png", nil, "manual")
			if e != nil {
				t.Fatal(e)
			}
			if _, e = photos.Upload(ctx, media.Access{Principal: b}, other.ID, bytes.NewReader(data.Bytes()), "image/png", nil, "http"); e != nil {
				t.Fatal(e)
			}
			before := databaseEvidence(t, p)
			archive := filepath.Join(t.TempDir(), "archive")
			if evidence := os.Getenv("CUBEOS_RECOVERY_EVIDENCE_DIR"); evidence != "" {
				if e = os.MkdirAll(evidence, 0700); e != nil {
					t.Fatal(e)
				}
				archive = filepath.Join(evidence, backend+"-"+uuid.NewString())
			}
			if e = Backup(ctx, sourceURL, source, cfg.MediaStorage, archive, false); e == nil {
				t.Fatal("backup without quiescence acknowledgement")
			}
			if e = Backup(ctx, sourceURL, source, cfg.MediaStorage, archive, true); e == nil {
				t.Fatal("backup accepted connected writer")
			}
			p.Close()
			if e = source.Delete(ctx, photo.OriginalKey); e != nil {
				t.Fatal(e)
			}
			if e = Backup(ctx, sourceURL, source, cfg.MediaStorage, archive, true); e == nil {
				t.Fatal("ready original missing accepted in backup")
			}
			if e = source.Put(ctx, photo.OriginalKey, bytes.NewReader(data.Bytes()), "image/png"); e != nil {
				t.Fatal(e)
			}
			if e = Backup(ctx, sourceURL, source, cfg.MediaStorage, archive, true); e != nil {
				t.Fatal(e)
			}
			targetCfg := cfg
			targetCfg.MediaLocalRoot = filepath.Join(t.TempDir(), "cubeos-restore-"+uuid.NewString())
			target := makeStore(&targetCfg, "cubeos-restore-")
			if e = Restore(ctx, sourceURL, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e == nil {
				t.Fatal("restore accepted source target")
			}
			if e = Restore(ctx, targetURL, target, targetCfg.MediaStorage, targetName(targetCfg), archive, false); e == nil {
				t.Fatal("implicit disposable target")
			}
			// Corrupt bytes before restore: no database or object mutation is permitted.
			path := filepath.Join(archive, "objects", photo.OriginalKey)
			original, e := os.ReadFile(path)
			if e != nil {
				t.Fatal(e)
			}
			os.WriteFile(path, []byte("corrupt"), 0600)
			if e = Restore(ctx, targetURL, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e == nil {
				t.Fatal("corrupt archive accepted")
			}
			if keys, e := target.Keys(ctx); e != nil || len(keys) != 0 {
				t.Fatal("failed validation wrote objects")
			}
			os.WriteFile(path, original, 0600)
			// Occupied objects refuse restoration without overwriting user data.
			key := "photos/" + uuid.NewString() + "/original"
			target.Put(ctx, key, bytes.NewReader([]byte("occupied")), "image/png")
			if e = Restore(ctx, targetURL, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e == nil {
				t.Fatal("occupied objects accepted")
			}
			target.Delete(ctx, key)
			// Exercise a real pg_restore permission failure after object writes. Its
			// single transaction must roll back DB; our own copied objects must be
			// cleaned before a retry into that still-empty disposable target.
			role := "restore_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			password := uuid.NewString()
			if _, e = admin.Exec(ctx, `CREATE ROLE "`+role+`" LOGIN PASSWORD '`+password+`'`); e != nil {
				t.Fatal("fixture role")
			}
			u, _ := url.Parse(targetURL)
			u.User = url.UserPassword(role, password)
			restricted := u.String()
			if e = Restore(ctx, restricted, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e == nil {
				t.Fatal("restore ignored real PostgreSQL permission failure")
			}
			if keys, e := target.Keys(ctx); e != nil || len(keys) != 0 {
				t.Fatal("failed restore left partial objects")
			}
			verify, e := pgxpool.New(ctx, targetURL)
			if e != nil {
				t.Fatal(e)
			}
			var tables int
			if e = verify.QueryRow(ctx, "SELECT count(*) FROM pg_tables WHERE schemaname='public'").Scan(&tables); e != nil || tables != 0 {
				t.Fatal("partial database after failed restore")
			}
			if _, e = verify.Exec(ctx, `GRANT CREATE ON SCHEMA public TO "`+role+`"`); e != nil {
				t.Fatal(e)
			}
			verify.Close()
			if e = Restore(ctx, restricted, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e != nil {
				t.Fatal(e)
			}
			q, e := pgxpool.New(ctx, targetURL)
			if e != nil {
				t.Fatal(e)
			}
			if got := databaseEvidence(t, q); got != before {
				t.Fatal("database rows, bytes, ownership, dates, hashes or projections changed")
			}
			r, e := target.Open(ctx, photo.OriginalKey)
			if e != nil {
				t.Fatal(e)
			}
			got, e := io.ReadAll(r)
			r.Close()
			if e != nil || !bytes.Equal(got, data.Bytes()) {
				t.Fatal("original changed")
			}
			// Production property checks and reconstruction against restored rows.
			if _, e = devices.NewRepository(q).Get(ctx, b, d.ID); e == nil {
				t.Fatal("owner B can read A")
			}
			if _, e = media.New(q, target, targetCfg).List(ctx, b, d.ID, 24, ""); e == nil {
				t.Fatal("owner B can list A photos")
			}
			repo := telemetry.NewRepository(q)
			projection, e := repo.GetSnapshot(ctx, a, d.ID)
			if e != nil {
				t.Fatal(e)
			}
			if e = repo.Rebuild(ctx, a, d.ID); e != nil {
				t.Fatal(e)
			}
			rebuilt, e := repo.GetSnapshot(ctx, a, d.ID)
			if e != nil || fmt.Sprint(projection) != fmt.Sprint(rebuilt) {
				t.Fatal("snapshot reconstruction changed")
			}
			q.Close()
			if e = Restore(ctx, targetURL, target, targetCfg.MediaStorage, targetName(targetCfg), archive, true); e == nil {
				t.Fatal("occupied database accepted")
			}
		})
	}
}

func targetName(c config.Config) string {
	if c.MediaStorage == "local" {
		return c.MediaLocalRoot
	}
	return c.MediaBucket
}
func databaseEvidence(t *testing.T, p *pgxpool.Pool) string {
	t.Helper()
	var out string
	for _, table := range []string{"users", "auth_identities", "devices", "steps", "step_progress", "ingestion_sources", "media_credentials", "received_packets", "device_telemetry_state", "device_snapshots", "photos", "schema_migrations"} {
		var rows string
		if e := p.QueryRow(context.Background(), "SELECT coalesce(jsonb_agg(r ORDER BY r::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(t) r FROM "+table+" t) x").Scan(&rows); e != nil {
			t.Fatal(e)
		}
		out += table + rows
	}
	return out
}
