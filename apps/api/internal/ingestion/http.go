package ingestion

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"
)

type Authenticator interface {
	Authenticate(context.Context, string) (string, error)
}

// NewHTTP is a machine-only route. The management listener applies its own Host
// guard; a dedicated listener must additionally enforce its configured Host.
func NewHTTP(s *Service, auth Authenticator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		reply := func(status int, v any) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(v)
		}
		fail := func(status int, code string) { reply(status, map[string]any{"error": map[string]string{"code": code}}) }
		if r.URL.Path != "/api/v1/ingestion/packets" {
			fail(404, "not_found")
			return
		}
		if r.Method != "POST" {
			fail(405, "method_not_allowed")
			return
		}
		if r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") != "" {
			fail(403, "machine_only")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(401, "invalid_credential")
			return
		}
		source, err := auth.Authenticate(ctx, strings.TrimPrefix(header, "Bearer "))
		if errors.Is(err, ErrCredential) {
			fail(401, "invalid_credential")
			return
		}
		if err != nil {
			fail(503, "storage_unavailable")
			return
		}
		ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || ct != "application/json" {
			fail(415, "json_required")
			return
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxEnvelopeBytes))
		if err != nil {
			var big *http.MaxBytesError
			if errors.As(err, &big) {
				fail(413, "envelope_too_large")
			} else {
				fail(400, "invalid_body")
			}
			return
		}
		result, err := s.IngestEnvelope(ctx, source, raw)
		if err != nil {
			fail(503, "storage_unavailable")
			return
		}
		status := 200
		if result.Status == "rejected" {
			status = 422
		}
		reply(status, result)
	})
}
func RestrictedHTTP(host string, handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host {
			w.WriteHeader(403)
			return
		}
		handler.ServeHTTP(w, r)
	})
}
