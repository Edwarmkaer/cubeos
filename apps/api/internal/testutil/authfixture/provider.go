// Package authfixture is imported only by tests. Keys/tokens are generated per
// process, never persisted. Production has no fixture resolver or runtime switch.
package authfixture

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Provider struct {
	Server      *httptest.Server
	key         *rsa.PrivateKey
	mu          sync.Mutex
	revoked     map[string]bool
	unavailable bool
}

func New(t *testing.T) *Provider {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &Provider{key: key, revoked: map[string]bool{}}
	p.Server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.Lock()
		defer p.mu.Unlock()
		if p.unavailable {
			w.WriteHeader(503)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/.well-known/jwks.json" {
			json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{"kid": "ephemeral", "kty": "RSA", "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/v1/sessions/") || r.Header.Get("Authorization") != "Bearer fixture-only" {
			w.WriteHeader(401)
			return
		}
		sid := strings.TrimPrefix(r.URL.Path, "/v1/sessions/")
		status := "active"
		if p.revoked[sid] {
			status = "revoked"
		}
		json.NewEncoder(w).Encode(map[string]any{"id": sid, "user_id": "user_" + strings.TrimPrefix(sid, "sess_"), "status": status})
	}))
	t.Cleanup(p.Server.Close)
	return p
}

type transport struct {
	base   http.RoundTripper
	target string
}

func (tr transport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	u := *r.URL
	r.URL = &u
	if r.URL.Host == "api.clerk.com" {
		target := strings.TrimPrefix(tr.target, "https://")
		r.URL.Host = target
		r.Host = target
	}
	return tr.base.RoundTrip(r)
}
func (p *Provider) Resolver(pool *pgxpool.Pool, origin string) *identity.Clerk {
	c := identity.NewClerk(pool, p.Server.URL, p.Server.URL+"/.well-known/jwks.json", "cubeos", origin, "fixture-only")
	c.Client.Transport = transport{p.Server.Client().Transport, p.Server.URL}
	return c
}
func (p *Provider) Token(t *testing.T, subject, origin string, lifetime time.Duration, edit func(jwt.MapClaims)) string {
	t.Helper()
	now := time.Now().Unix()
	cl := jwt.MapClaims{"iss": p.Server.URL, "aud": "cubeos", "azp": origin, "sub": subject, "sid": "sess_" + strings.TrimPrefix(subject, "user_"), "iat": now, "nbf": now - 1, "exp": time.Now().Add(lifetime).Unix()}
	if edit != nil {
		edit(cl)
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, cl)
	tok.Header["kid"] = "ephemeral"
	raw, err := tok.SignedString(p.key)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func (p *Provider) Revoke(sid string) { p.mu.Lock(); defer p.mu.Unlock(); p.revoked[sid] = true }
func (p *Provider) Fail(v bool)       { p.mu.Lock(); defer p.mu.Unlock(); p.unavailable = v }
