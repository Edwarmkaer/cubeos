package http_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/testutil/authfixture"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPublicIdentityOwnershipRevocationAndBrowser(t *testing.T) {
	db := os.Getenv("TEST_AUTH_DATABASE_URL")
	if db == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("TEST_AUTH_DATABASE_URL required")
		}
		t.Skip("exclusive auth DB required")
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
		id, e := identity.Enroll(ctx, pool, subject, subject)
		if e != nil {
			t.Fatal(e)
		}
		again, e := identity.Enroll(ctx, pool, subject, "Changed")
		if e != nil || again != id {
			t.Fatal("enrollment not idempotent", e)
		}
	}
	var local int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM auth_identities WHERE provider='local'").Scan(&local); err != nil || local != 0 {
		t.Fatal("public init created local fallback", err)
	}
	provider := authfixture.New(t)
	origin := "http://localhost:3118"
	if override := os.Getenv("CUBEOS_AUTH_BROWSER_ORIGIN"); override != "" {
		origin = override
	}
	server := httptest.NewUnstartedServer(nil)
	server.StartTLS()
	defer server.Close()
	u, _ := url.Parse(server.URL)
	cfg := config.Config{Mode: "public", PublicAPIHost: u.Host, Origin: origin}
	hub := realtime.NewHub()
	defer hub.Close()
	listenCtx, stop := context.WithCancel(ctx)
	defer stop()
	go hub.Run(listenCtx, db)
	resolver := provider.Resolver(pool, origin)
	server.Config.Handler = api.NewWithRealtime(cfg, pool, devices.NewRepository(pool), telemetry.NewRepository(pool), resolver.Resolve, hub)
	client := server.Client()
	client.Timeout = 5 * time.Second
	a := provider.Token(t, "user_A", origin, 3*time.Minute, nil)
	b := provider.Token(t, "user_B", origin, 3*time.Minute, nil)
	request := func(method, path, body, token string, want int) []byte {
		t.Helper()
		r, e := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if e != nil {
			t.Fatal(e)
		}
		if path != "/api/v1/ingestion/packets" {
			r.Header.Set("Origin", origin)
			r.Header.Set("Sec-Fetch-Site", "cross-site")
		}
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		resp, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		defer resp.Body.Close()
		raw, e := io.ReadAll(resp.Body)
		if e != nil || resp.StatusCode != want {
			t.Fatalf("%s %s: HTTP %d want %d", method, path, resp.StatusCode, want)
		}
		return raw
	}
	request("GET", "/api/v1/devices", "", "", 401)
	for _, edit := range []func(jwt.MapClaims){func(c jwt.MapClaims) { c["iss"] = "https://evil.example" }, func(c jwt.MapClaims) { c["aud"] = "wrong" }, func(c jwt.MapClaims) { c["exp"] = time.Now().Unix() - 1 }} {
		request("GET", "/api/v1/devices", "", provider.Token(t, "user_A", origin, time.Minute, edit), 401)
	}
	request("GET", "/api/v1/devices", "", provider.Token(t, "user_unknown", origin, time.Minute, nil), 401)
	raw := request("POST", "/api/v1/devices", `{"name":"Private A","protocolDeviceId":"CS01"}`, a, 201)
	var d devices.Device
	if json.Unmarshal(raw, &d) != nil {
		t.Fatal("device response")
	}
	path := "/api/v1/devices/" + d.ID
	for _, suffix := range []string{"", "/snapshot", "/packets", "/packets.csv?m=E", "/events", "/sources"} {
		request("GET", path+suffix, "", b, 404)
	}
	request("PATCH", path, `{"name":"Stolen"}`, b, 404)
	request("DELETE", path, "", b, 404)
	request("POST", path+"/sources", `{"transport":"http"}`, b, 404)
	if strings.TrimSpace(string(request("GET", "/api/v1/devices", "", b, 200))) != "[]" {
		t.Fatal("A device leaked into B list")
	}
	var source struct {
		ID         string `json:"id"`
		Credential string `json:"credential"`
	}
	if json.Unmarshal(request("POST", path+"/sources", `{"transport":"http"}`, a, 201), &source) != nil {
		t.Fatal("source")
	}
	packet := `{"envelopeVersion":1,"payload":{"v":2,"id":"CS01","m":"E","n":1,"u":1000,"t":0,"st":1,"fl":0,"t1":2465,"rh":5210,"p1":100843,"gr":128400}}`
	request("POST", "/api/v1/ingestion/packets", packet, source.Credential, 200)
	for _, suffix := range []string{"/snapshot", "/packets", "/packets.csv?m=E"} {
		request("GET", path+suffix, "", a, 200)
	}
	request("DELETE", path+"/sources/"+source.ID, "", b, 404)
	request("POST", "/api/v1/ingestion/packets", strings.Replace(packet, `"n":1`, `"n":2`, 1), source.Credential, 200)
	request("DELETE", path+"/sources/"+source.ID, "", a, 204)
	request("POST", "/api/v1/ingestion/packets", packet, source.Credential, 401)
	// Actual signed-token stream terminates at expiry without needing new data.
	streamClient := server.Client()
	streamClient.Timeout = 20 * time.Second
	open := func(token string) *http.Response {
		t.Helper()
		r, _ := http.NewRequest("GET", server.URL+path+"/events", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Origin", origin)
		resp, e := streamClient.Do(r)
		if e != nil || resp.StatusCode != 200 {
			t.Fatal("authorized stream", e)
		}
		return resp
	}
	short := provider.Token(t, "user_A", origin, 2*time.Second, nil)
	resp := open(short)
	start := time.Now()
	_, err = io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil || time.Since(start) > 3*time.Second {
		t.Fatal("expired signed stream did not terminate", err)
	}
	// Publish triggers the same revalidation as the 15s heartbeat; no mock resolver.
	resp = open(a)
	provider.Revoke("sess_A")
	hub.Notify(d.ID)
	_, err = io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatal("revoked signed stream did not terminate", err)
	}
	request("GET", path, "", a, 401)
	provider.Fail(true)
	request("GET", "/api/v1/devices", "", b, 503)
	provider.Fail(false)
	// Idle sessions are revalidated by the real heartbeat, without notification.
	dRaw := request("POST", "/api/v1/devices", `{"name":"Private B","protocolDeviceId":"CS01"}`, b, 201)
	var deviceB devices.Device
	if json.Unmarshal(dRaw, &deviceB) != nil {
		t.Fatal("B device")
	}
	r, _ := http.NewRequest("GET", server.URL+"/api/v1/devices/"+deviceB.ID+"/events", nil)
	r.Header.Set("Authorization", "Bearer "+b)
	r.Header.Set("Origin", origin)
	resp, err = streamClient.Do(r)
	if err != nil || resp.StatusCode != 200 {
		t.Fatal("B idle stream", err)
	}
	provider.Revoke("sess_B")
	start = time.Now()
	_, err = io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil || time.Since(start) > 19*time.Second {
		t.Fatal("idle revoked session survived heartbeat", err)
	}
	if os.Getenv("CUBEOS_AUTH_BROWSER") == "1" {
		// Fresh signed fixture sessions for the browser. No token is written to disk.
		a = provider.Token(t, "user_BrowserA", origin, 3*time.Minute, nil)
		b = provider.Token(t, "user_BrowserB", origin, 3*time.Minute, nil)
		for _, subject := range []string{"user_BrowserA", "user_BrowserB"} {
			if _, e := identity.Enroll(ctx, pool, subject, subject); e != nil {
				t.Fatal(e)
			}
		}
		input, _ := json.Marshal(map[string]any{"apiURL": server.URL, "origin": origin, "a": a, "b": b, "expired": provider.Token(t, "user_BrowserA", origin, -time.Minute, nil)})
		cmd := exec.Command("node", "../../../web/tests/browser-auth.mjs")
		cmd.Stdin = strings.NewReader(string(input))
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if e := cmd.Run(); e != nil {
			t.Fatal("signed browser boundary", e)
		}
	}
}
