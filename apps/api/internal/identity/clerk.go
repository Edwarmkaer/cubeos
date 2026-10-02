package identity

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUnauthorized = errors.New("session unauthorized")
var ErrProviderUnavailable = errors.New("identity provider unavailable")

// Clerk trusts only operator configuration, never URLs embedded in a token.
// No cache: provider/session failure denies access, including existing streams.
type Clerk struct {
	Issuer, JWKSURL, Audience, AuthorizedParty, SecretKey string
	Client                                                *http.Client
	Lookup                                                func(context.Context, string) (string, error)
	sessionURL                                            string
}

func NewClerk(p *pgxpool.Pool, issuer, jwks, audience, origin, secret string) *Clerk {
	return &Clerk{Issuer: issuer, JWKSURL: jwks, Audience: audience, AuthorizedParty: origin, SecretKey: secret,
		Client: &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		Lookup: func(ctx context.Context, subject string) (string, error) {
			var id string
			err := p.QueryRow(ctx, "SELECT user_id::text FROM auth_identities WHERE provider='clerk' AND subject=$1", subject).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return "", ErrUnauthorized
			}
			return id, err
		}, sessionURL: "https://api.clerk.com/v1/sessions/"}
}

func (c *Clerk) fetch(ctx context.Context, target string, secret bool, out any) error {
	r, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return ErrProviderUnavailable
	}
	if secret {
		r.Header.Set("Authorization", "Bearer "+c.SecretKey)
	}
	resp, err := c.Client.Do(r)
	if err != nil {
		return ErrProviderUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ErrProviderUnavailable
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, (128<<10)+1))
	if err != nil || len(raw) > 128<<10 || json.Unmarshal(raw, out) != nil {
		return ErrProviderUnavailable
	}
	return nil
}

func (c *Clerk) Resolve(ctx context.Context, r *http.Request) (Principal, error) {
	parts := strings.Split(r.Header.Get("Authorization"), " ")
	if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" || len(parts[1]) > 16384 {
		return Principal{}, ErrUnauthorized
	}
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(parts[1], claims, func(token *jwt.Token) (any, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" || len(kid) > 256 {
			return nil, ErrUnauthorized
		}
		var set struct {
			Keys []struct {
				KID string `json:"kid"`
				KTY string `json:"kty"`
				Alg string `json:"alg"`
				Use string `json:"use"`
				N   string `json:"n"`
				E   string `json:"e"`
			} `json:"keys"`
		}
		if e := c.fetch(ctx, c.JWKSURL, false, &set); e != nil {
			return nil, e
		}
		for _, k := range set.Keys {
			if k.KID != kid || k.KTY != "RSA" || k.Alg != "RS256" || k.Use != "sig" {
				continue
			}
			n, e1 := base64.RawURLEncoding.DecodeString(k.N)
			e, e2 := base64.RawURLEncoding.DecodeString(k.E)
			if e1 != nil || e2 != nil || len(n) < 256 || len(n) > 1024 || len(e) == 0 || len(e) > 4 {
				return nil, ErrUnauthorized
			}
			exponent := new(big.Int).SetBytes(e).Int64()
			if exponent < 3 || exponent > 2147483647 || exponent%2 == 0 {
				return nil, ErrUnauthorized
			}
			return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(exponent)}, nil
		}
		return nil, ErrUnauthorized
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(c.Issuer), jwt.WithAudience(c.Audience), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			return Principal{}, ErrProviderUnavailable
		}
		return Principal{}, ErrUnauthorized
	}
	exp, e1 := claims.GetExpirationTime()
	nbf, e2 := claims.GetNotBefore()
	iat, e3 := claims.GetIssuedAt()
	sub, _ := claims["sub"].(string)
	sid, _ := claims["sid"].(string)
	azp, _ := claims["azp"].(string)
	sts, _ := claims["sts"].(string)
	if e1 != nil || e2 != nil || e3 != nil || exp == nil || nbf == nil || iat == nil || sub == "" || len(sub) > 256 || !safeID(sid) || azp != c.AuthorizedParty || (sts != "" && sts != "active") || !exp.After(iat.Time) {
		return Principal{}, ErrUnauthorized
	}
	var session struct {
		ID     string `json:"id"`
		UserID string `json:"user_id"`
		Status string `json:"status"`
	}
	if err = c.fetch(ctx, c.sessionURL+url.PathEscape(sid), true, &session); err != nil {
		return Principal{}, err
	}
	if session.ID != sid || session.UserID != sub || session.Status != "active" {
		return Principal{}, ErrUnauthorized
	}
	id, err := c.Lookup(ctx, sub)
	if err != nil || id == "" {
		if err == nil {
			err = ErrUnauthorized
		}
		return Principal{}, err
	}
	if !time.Now().Before(exp.Time) {
		return Principal{}, ErrUnauthorized
	}
	expires := exp.Time
	if bound := time.Now().Add(5 * time.Minute); expires.After(bound) {
		expires = bound
	}
	return Principal{UserID: id, ExpiresAt: expires}, nil
}

func safeID(id string) bool {
	if len(id) < 1 || len(id) > 256 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_') {
			return false
		}
	}
	return true
}

// Enroll is a trusted DB administration operation; JWT verification never calls it.
// Repeating enrollment preserves the internal UUID. No email key or auto signup.
func Enroll(ctx context.Context, p *pgxpool.Pool, subject, name string) (string, error) {
	name = strings.TrimSpace(name)
	if !safeID(subject) || !strings.HasPrefix(subject, "user_") || name == "" || len(name) > 120 || strings.ContainsAny(name, "\x00\r\n") {
		return "", errors.New("invalid enrollment")
	}
	tx, err := p.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026100108)"); err != nil {
		return "", err
	}
	var id string
	err = tx.QueryRow(ctx, "SELECT user_id::text FROM auth_identities WHERE provider='clerk' AND subject=$1", subject).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		if err = tx.QueryRow(ctx, "INSERT INTO users(display_name) VALUES($1) RETURNING id::text", name).Scan(&id); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO auth_identities(user_id,provider,subject) VALUES($1,'clerk',$2)", id, subject); err != nil {
			return "", err
		}
	} else if err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}
