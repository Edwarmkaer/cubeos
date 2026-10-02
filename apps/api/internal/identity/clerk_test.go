package identity

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"github.com/golang-jwt/jwt/v5"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClerkCryptographicClaimsAndProviderFailures(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	jwksOK, sessionOK := true, true
	status, sessionUser, sessionID := "active", "user_A", "sess_A"
	provider := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/jwks.json" {
			if !jwksOK {
				w.WriteHeader(503)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{"kid": "test-key", "kty": "RSA", "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
			return
		}
		if !sessionOK {
			w.WriteHeader(503)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"id": sessionID, "user_id": sessionUser, "status": status})
	}))
	defer provider.Close()
	lookup := func(_ context.Context, subject string) (string, error) {
		if subject == "user_A" {
			return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nil
		}
		return "", ErrUnauthorized
	}
	c := Clerk{Issuer: provider.URL, JWKSURL: provider.URL + "/.well-known/jwks.json", Audience: "cubeos", AuthorizedParty: "https://web.example", SecretKey: "fixture-only", Client: provider.Client(), Lookup: lookup, sessionURL: provider.URL + "/sessions/"}
	claims := func() jwt.MapClaims {
		now := time.Now().Unix()
		return jwt.MapClaims{"iss": provider.URL, "aud": "cubeos", "azp": "https://web.example", "sub": "user_A", "sid": "sess_A", "iat": now, "nbf": now - 1, "exp": now + 60}
	}
	resolve := func(cl jwt.MapClaims, k *rsa.PrivateKey) (Principal, error) {
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, cl)
		tok.Header["kid"] = "test-key"
		raw, e := tok.SignedString(k)
		if e != nil {
			t.Fatal(e)
		}
		r := httptest.NewRequest("GET", "https://api.example/api/v1/devices", nil)
		r.Header.Set("Authorization", "Bearer "+raw)
		return c.Resolve(context.Background(), r)
	}
	p, err := resolve(claims(), key)
	if err != nil || p.UserID == "" || p.ExpiresAt.IsZero() {
		t.Fatalf("valid signed token denied: %v", err)
	}
	for _, name := range []string{"signature", "issuer", "audience", "expired", "future", "missing_exp", "missing_nbf", "missing_iat", "unknown_subject", "azp", "sid", "pending"} {
		t.Run(name, func(t *testing.T) {
			cl := claims()
			k := key
			switch name {
			case "signature":
				k = other
			case "issuer":
				cl["iss"] = "https://evil.example"
			case "audience":
				cl["aud"] = "other"
			case "expired":
				cl["exp"] = time.Now().Unix() - 1
			case "future":
				cl["nbf"] = time.Now().Unix() + 20
			case "missing_exp":
				delete(cl, "exp")
			case "missing_nbf":
				delete(cl, "nbf")
			case "missing_iat":
				delete(cl, "iat")
			case "unknown_subject":
				cl["sub"] = "user_unknown"
			case "azp":
				cl["azp"] = "https://evil.example"
			case "sid":
				cl["sid"] = "../bad"
			case "pending":
				cl["sts"] = "pending"
			}
			if p, e := resolve(cl, k); e == nil || p.UserID != "" {
				t.Fatal("unsafe token accepted")
			}
		})
	}
	for _, method := range []jwt.SigningMethod{jwt.SigningMethodHS256, jwt.SigningMethodNone} {
		tok := jwt.NewWithClaims(method, claims())
		tok.Header["kid"] = "test-key"
		var k any = []byte("isolated fixture signing key")
		if method == jwt.SigningMethodNone {
			k = jwt.UnsafeAllowNoneSignatureType
		}
		raw, e := tok.SignedString(k)
		if e != nil {
			t.Fatal(e)
		}
		r := httptest.NewRequest("GET", "https://api.example", nil)
		r.Header.Set("Authorization", "Bearer "+raw)
		if p, e := c.Resolve(context.Background(), r); e == nil || p.UserID != "" {
			t.Fatal("algorithm confusion accepted")
		}
	}
	for _, v := range []struct{ status, user, id string }{{"revoked", "user_A", "sess_A"}, {"ended", "user_A", "sess_A"}, {"active", "user_B", "sess_A"}, {"active", "user_A", "sess_B"}} {
		status, sessionUser, sessionID = v.status, v.user, v.id
		if p, e := resolve(claims(), key); e == nil || p.UserID != "" {
			t.Fatal("inactive/mismatched session accepted")
		}
	}
	status, sessionUser, sessionID = "active", "user_A", "sess_A"
	cl := claims()
	cl["exp"] = time.Now().Unix() + 3600
	if p, e := resolve(cl, key); e != nil || time.Until(p.ExpiresAt) > 5*time.Minute {
		t.Fatal("stream session lifetime not bounded", e)
	}
	jwksOK = false
	if p, e := resolve(claims(), key); e == nil || p.UserID != "" {
		t.Fatal("JWKS failure granted access")
	}
	jwksOK = true
	sessionOK = false
	if p, e := resolve(claims(), key); e == nil || p.UserID != "" {
		t.Fatal("session failure granted access")
	}
	for _, header := range []string{"", "Bearer invalid", "Basic abc", "Bearer a b"} {
		r := httptest.NewRequest("GET", "https://api.example", strings.NewReader(""))
		r.Header.Set("Authorization", header)
		if p, e := c.Resolve(context.Background(), r); e == nil || p.UserID != "" {
			t.Fatal("malformed bearer accepted")
		}
	}
}
