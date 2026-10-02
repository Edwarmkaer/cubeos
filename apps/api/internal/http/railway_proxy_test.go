package http_test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/media"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/testutil/authfixture"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Real TLS termination and streaming reverse proxy, signed sessions, DB and
// private S3: buffering, forwarded-host trust or omitted ownership breaks this.
func TestRailwayProxySignedSSEAndBoundedPhotos(t *testing.T) {
	db := os.Getenv("TEST_RAILWAY_PROXY_DATABASE_URL")
	if db == "" {
		if os.Getenv("RECOVERY_REQUIRED") == "1" {
			t.Fatal("proxy DB required")
		}
		t.Skip("exclusive proxy DB required")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p, e := pgxpool.New(ctx, db)
	if e != nil {
		t.Fatal(e)
	}
	defer p.Close()
	if _, e = p.Exec(ctx, "DROP SCHEMA public CASCADE;CREATE SCHEMA public"); e != nil {
		t.Fatal(e)
	}
	if e = storage.Migrate(ctx, p); e != nil {
		t.Fatal(e)
	}
	aID, e := identity.Enroll(ctx, p, "user_A", "A")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = identity.Enroll(ctx, p, "user_B", "B"); e != nil {
		t.Fatal(e)
	}
	a := identity.Principal{UserID: aID}
	d, e := devices.NewRepository(p).Create(ctx, a, devices.Input{Name: "Private", ProtocolDeviceID: "CS01"})
	if e != nil {
		t.Fatal(e)
	}
	var sourceID string
	if e = p.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',$2) RETURNING id::text", d.ID, fmt.Sprintf("%x", sha256.Sum256([]byte("proxy fixture")))).Scan(&sourceID); e != nil {
		t.Fatal(e)
	}
	result, e := ingestion.NewService(ingestion.NewRepository(p)).Ingest(ctx, sourceID, []byte(`{"v":2,"id":"CS01","m":"E","n":1,"u":1000,"t":0,"st":1,"fl":0,"t1":2465,"rh":5120,"p1":101325,"gr":20000}`), telemetry.ReceiverMetadata{})
	if e != nil || result.Status != "accepted" {
		t.Fatal("ingestion")
	}
	origin := "https://web.example"
	provider := authfixture.New(t)
	resolver := provider.Resolver(p, origin)
	bucket := "cubeos-proxy-" + uuid.NewString()
	u, _ := url.Parse(os.Getenv("TEST_S3_ENDPOINT"))
	client, e := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("TEST_S3_ACCESS_KEY"), os.Getenv("TEST_S3_SECRET_KEY"), ""), Secure: u.Scheme == "https", Region: "us-east-1"})
	if e != nil {
		t.Fatal("private S3")
	}
	if e = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); e != nil {
		t.Fatal("private bucket")
	}
	c := config.Config{Mode: "public", PublicAPIHost: "api.example", Origin: origin, MediaStorage: "s3", MediaEndpoint: u.String(), MediaRegion: "us-east-1", MediaBucket: bucket, MediaAccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), MediaSecretKey: os.Getenv("TEST_S3_SECRET_KEY"), MediaTempRoot: t.TempDir(), MediaMaxBytes: 1024, MediaMaxPixels: 80_000_000}
	objects, e := media.Configure(c)
	if e != nil {
		t.Fatal(e)
	}
	photos := media.New(p, objects, c)
	hub := realtime.NewHub()
	defer hub.Close()
	go hub.Run(ctx, db)
	backend := httptest.NewServer(api.NewWithMedia(c, p, devices.NewRepository(p), telemetry.NewRepository(p), resolver.Resolve, hub, photos))
	defer backend.Close()
	upstream, _ := url.Parse(backend.URL)
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.FlushInterval = -1
	edge := httptest.NewTLSServer(proxy)
	defer edge.Close()
	httpClient := edge.Client()
	httpClient.Timeout = 8 * time.Second
	token := provider.Token(t, "user_A", origin, time.Minute, nil)
	other := provider.Token(t, "user_B", origin, time.Minute, nil)
	request := func(method, path, typ string, body io.Reader, bearer, host string, want int) *http.Response {
		t.Helper()
		r, e := http.NewRequest(method, edge.URL+path, body)
		if e != nil {
			t.Fatal(e)
		}
		r.Host = host
		r.Header.Set("Origin", origin)
		r.Header.Set("X-Forwarded-Host", "api.example")
		r.Header.Set("X-Forwarded-Proto", "https")
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		r.Header.Set("Content-Type", typ)
		response, e := httpClient.Do(r)
		if e != nil {
			t.Fatal("proxy request failed")
		}
		if response.StatusCode != want {
			response.Body.Close()
			t.Fatalf("%s %s got %d want %d", method, path, response.StatusCode, want)
		}
		return response
	}
	events := "/api/v1/devices/" + d.ID + "/events"
	for _, attempt := range []struct {
		host, token string
		status      int
	}{{"evil.example", token, 403}, {"api.example", "", 401}, {"api.example", other, 404}} {
		r := request("GET", events, "", nil, attempt.token, attempt.host, attempt.status)
		r.Body.Close()
	}
	short := provider.Token(t, "user_A", origin, 3*time.Second, nil)
	stream := request("GET", events, "", nil, short, "api.example", 200)
	reader := bufio.NewReader(stream.Body)
	found := false
	for !found {
		line, e := reader.ReadString('\n')
		if e != nil {
			t.Fatal("proxy buffered SSE")
		}
		found = strings.HasPrefix(line, "data:") && strings.Contains(line, "24.65")
	}
	// Short signed session must terminate through the proxy; a cookie/forwarded
	// header is not an alternative identity. No tokens are printed or persisted.
	for {
		_, e := reader.ReadString('\n')
		if e != nil {
			break
		}
	}
	stream.Body.Close()
	if r := request("GET", events, "", nil, short, "api.example", 401); r != nil {
		r.Body.Close()
	}
	upload := func(raw []byte, want int) []byte {
		var b bytes.Buffer
		m := multipart.NewWriter(&b)
		part, e := m.CreateFormFile("file", "ignored.png")
		if e != nil {
			t.Fatal(e)
		}
		part.Write(raw)
		m.Close()
		r := request("POST", "/api/v1/devices/"+d.ID+"/photos", m.FormDataContentType(), &b, token, "api.example", want)
		defer r.Body.Close()
		data, e := io.ReadAll(r.Body)
		if e != nil {
			t.Fatal(e)
		}
		return data
	}
	// Explicit image MIME instead of the default octet-stream.
	var raw bytes.Buffer
	png.Encode(&raw, image.NewNRGBA(image.Rect(0, 0, 12, 9)))
	// Oversized multipart is rejected before storage writes even through TLS proxy.
	upload(bytes.Repeat([]byte("x"), 128<<10), 413)
	photo, e := photos.Upload(ctx, media.Access{Principal: a}, d.ID, bytes.NewReader(raw.Bytes()), "image/png", nil, "manual")
	if e != nil {
		t.Fatal(e)
	}
	r := request("GET", "/api/v1/photos/"+photo.ID+"/original", "", nil, token, "api.example", 200)
	data, e := io.ReadAll(r.Body)
	r.Body.Close()
	if e != nil || !bytes.Equal(raw.Bytes(), data) || fmt.Sprintf("%x", sha256.Sum256(data)) != photo.SHA256 {
		t.Fatal("proxy changed original")
	}
	r = request("GET", "/api/v1/photos/"+photo.ID+"/original", "", nil, other, "api.example", 404)
	r.Body.Close()
	r = request("GET", "/api/v1/devices/"+d.ID+"/photos", "", nil, token, "api.example", 200)
	var list media.Page
	if json.NewDecoder(r.Body).Decode(&list) != nil || len(list.Items) != 1 {
		t.Fatal("oversized upload persisted metadata")
	}
	r.Body.Close()
}
