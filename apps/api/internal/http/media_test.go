package http_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"testing"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/media"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Missing ownership, promoting telemetry credentials, or recompressing originals breaks this.
func TestMediaHTTPExactOriginalOwnershipPaginationAndCredentials(t *testing.T) {
	db := os.Getenv("TEST_MEDIA_DATABASE_URL")
	if db == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("media PG required")
		}
		t.Skip("isolated media PG required")
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
	a, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	repo := devices.NewRepository(pool)
	device, err := repo.Create(ctx, a, devices.Input{Name: "Photos", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(func(k string) string {
		switch k {
		case "DATABASE_URL":
			return db
		case "MEDIA_LOCAL_ROOT", "MEDIA_TEMP_ROOT":
			return t.TempDir()
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	principal := a
	h := api.New(cfg, pool, repo, func(context.Context, *http.Request) (identity.Principal, error) { return principal, nil })
	check := func(method, path string, body []byte, typ, auth string, want int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, "http://127.0.0.1:8080"+path, bytes.NewReader(body))
		r.Header.Set("Content-Type", typ)
		r.Header.Set("Authorization", auth)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s %d want %d %s", method, path, w.Code, want, w.Body.String())
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private caching")
		}
		return w.Body.Bytes()
	}
	var raw bytes.Buffer
	png.Encode(&raw, image.NewNRGBA(image.Rect(0, 0, 9, 6)))
	original := raw.Bytes()
	upload := func(data []byte, mime string, auth string, want int) map[string]any {
		t.Helper()
		var body bytes.Buffer
		m := multipart.NewWriter(&body)
		part, e := m.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="../../camera.png"`}, "Content-Type": {mime}})
		if e != nil {
			t.Fatal(e)
		}
		part.Write(data)
		m.Close()
		result := check("POST", "/api/v1/devices/"+device.ID+"/photos", body.Bytes(), m.FormDataContentType(), auth, want)
		var photo map[string]any
		json.Unmarshal(result, &photo)
		return photo
	}
	photo := upload(original, "image/png", "", 201)
	id, _ := photo["id"].(string)
	if id == "" || photo["capturedAt"] != nil || photo["status"] != "ready" || photo["sha256"] != fmt.Sprintf("%x", sha256.Sum256(original)) {
		t.Fatal(photo)
	}
	if got := check("GET", "/api/v1/photos/"+id+"/original", nil, "", "", 200); !bytes.Equal(got, original) {
		t.Fatal("original bytes changed")
	}
	if got := check("GET", "/api/v1/photos/"+id+"/thumbnail", nil, "", "", 200); bytes.Equal(got, original) || len(got) == 0 {
		t.Fatal("thumbnail")
	}
	upload(original, "image/jpeg", "", 415)
	upload([]byte("fake"), "image/png", "", 415)
	upload(original, "image/png", "", 201)
	var page struct {
		Items      []map[string]any `json:"items"`
		NextCursor string           `json:"nextCursor"`
	}
	json.Unmarshal(check("GET", "/api/v1/devices/"+device.ID+"/photos?limit=1", nil, "", "", 200), &page)
	if len(page.Items) != 1 || page.NextCursor == "" {
		t.Fatal(page)
	}
	first := page.Items[0]["id"]
	json.Unmarshal(check("GET", "/api/v1/devices/"+device.ID+"/photos?limit=1&cursor="+page.NextCursor, nil, "", "", 200), &page)
	if len(page.Items) != 1 || page.Items[0]["id"] == first || page.NextCursor != "" {
		t.Fatal(page)
	}
	b := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	pool.Exec(ctx, "INSERT INTO users(id,display_name) VALUES($1,'B')", b)
	principal = identity.Principal{UserID: b}
	check("GET", "/api/v1/photos/"+id+"/original", nil, "", "", 404)
	check("GET", "/api/v1/photos/"+id+"/thumbnail", nil, "", "", 404)
	check("GET", "/api/v1/devices/"+device.ID+"/photos", nil, "", "", 404)
	upload(original, "image/png", "", 404)
	principal = a
	var credential struct{ ID, Credential string }
	json.Unmarshal(check("POST", "/api/v1/devices/"+device.ID+"/media-credentials", []byte(`{}`), "application/json", "", 201), &credential)
	if credential.Credential == "" {
		t.Fatal("credential")
	}
	upload(original, "image/png", "Bearer "+credential.Credential, 201)
	objectStore, e := media.Configure(cfg)
	if e != nil {
		t.Fatal(e)
	}
	ingress := api.NewIngestionHTTP("127.0.0.1:8081", http.NotFoundHandler(), media.New(pool, objectStore, cfg), cfg.MediaMaxBytes)
	var hardwareBody bytes.Buffer
	hardwareMultipart := multipart.NewWriter(&hardwareBody)
	part, e := hardwareMultipart.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="pi.png"`}, "Content-Type": {"image/png"}})
	if e != nil {
		t.Fatal(e)
	}
	part.Write(original)
	hardwareMultipart.Close()
	r := httptest.NewRequest("POST", "http://127.0.0.1:8081/api/v1/devices/"+device.ID+"/photos", bytes.NewReader(hardwareBody.Bytes()))
	r.Header.Set("Content-Type", hardwareMultipart.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+credential.Credential)
	hw := httptest.NewRecorder()
	ingress.ServeHTTP(hw, r)
	if hw.Code != 201 {
		t.Fatal("hardware listener upload", hw.Code, hw.Body.String())
	}
	for _, path := range []string{"/api/v1/devices", "/api/v1/devices/" + device.ID + "/media-credentials", "/api/v1/photos/" + id + "/original"} {
		r := httptest.NewRequest("GET", "http://127.0.0.1:8081"+path, nil)
		r.Header.Set("Authorization", "Bearer "+credential.Credential)
		hw := httptest.NewRecorder()
		ingress.ServeHTTP(hw, r)
		if hw.Code != 404 {
			t.Fatal("management/read exposed to hardware", path, hw.Code)
		}
	}
	// Hardware auth never promotes to user read/management, even with a permissive fixture resolver.
	check("GET", "/api/v1/photos/"+id+"/original", nil, "", "Bearer "+credential.Credential, 401)
	check("GET", "/api/v1/devices/"+device.ID+"/photos", nil, "", "Bearer "+credential.Credential, 401)
	check("DELETE", "/api/v1/devices/"+device.ID+"/media-credentials/"+credential.ID, nil, "", "", 204)
	upload(original, "image/png", "Bearer "+credential.Credential, 401)
	var telemetry struct{ Credential string }
	json.Unmarshal(check("POST", "/api/v1/devices/"+device.ID+"/sources", []byte(`{"transport":"http"}`), "application/json", "", 201), &telemetry)
	upload(original, "image/png", "Bearer "+telemetry.Credential, 401)
}
