package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"mime"
	"net"
	"net/http"
	"strings"
	"time"
)

type Resolver func(context.Context, *http.Request) (identity.Principal, error)

// DeviceStore is the persistence port consumed by these HTTP use cases.
type DeviceStore interface {
	List(context.Context, identity.Principal) ([]devices.Device, error)
	Get(context.Context, identity.Principal, string) (devices.Device, error)
	Create(context.Context, identity.Principal, devices.Input) (devices.Device, error)
	Rename(context.Context, identity.Principal, string, string) (devices.Device, error)
	Delete(context.Context, identity.Principal, string) error
}

func New(c config.Config, p *pgxpool.Pool, d DeviceStore, resolve Resolver) http.Handler {
	return NewWithTelemetry(c, p, d, telemetry.NewRepository(p), resolve)
}
func NewWithTelemetry(c config.Config, p *pgxpool.Pool, d DeviceStore, readings TelemetryStore, resolve Resolver) http.Handler {
	return NewWithRealtime(c, p, d, readings, resolve, realtime.NewHub())
}
func NewWithRealtime(c config.Config, p *pgxpool.Pool, d DeviceStore, readings TelemetryStore, resolve Resolver, hub *realtime.Hub) http.Handler {
	sources := ingestion.NewSources(p)
	packets := ingestion.NewHTTP(ingestion.NewService(ingestion.NewRepository(p)), sources)
	stream := realtime.NewSSE(hub, func(ctx context.Context, r *http.Request, id string) (identity.Principal, telemetry.Projection, error) {
		principal, err := resolve(ctx, r)
		if err != nil {
			if errors.Is(err, identity.ErrUnauthorized) {
				return principal, telemetry.Projection{}, realtime.ErrUnauthorized
			}
			return principal, telemetry.Projection{}, err
		}
		if !uuid(principal.UserID) || (!principal.ExpiresAt.IsZero() && !time.Now().Before(principal.ExpiresAt)) {
			return principal, telemetry.Projection{}, realtime.ErrUnauthorized
		}
		if _, err = d.Get(ctx, principal, id); err != nil {
			return principal, telemetry.Projection{}, err
		}
		snapshot, err := readings.GetSnapshot(ctx, principal, id)
		return principal, snapshot, err
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		host, port, err := net.SplitHostPort(r.Host)
		ip := net.ParseIP(host)
		if (c.Mode == "public" && r.Host != c.PublicAPIHost) || (c.Mode != "public" && (err != nil || port != c.Port || (host != "localhost" && (ip == nil || !ip.IsLoopback())))) {
			problem(w, 403, "host_forbidden")
			return
		}
		origin := r.Header.Get("Origin")
		if origin != "" && origin != c.Origin {
			problem(w, 403, "origin_forbidden")
			return
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" && (c.Mode != "public" || origin != c.Origin) {
			problem(w, 403, "site_forbidden")
			return
		}
		if origin == c.Origin {
			w.Header().Set("Access-Control-Allow-Origin", c.Origin)
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == "OPTIONS" {
			if origin != c.Origin {
				problem(w, 403, "origin_required")
				return
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Last-Event-ID")
			w.WriteHeader(204)
			return
		}
		if r.URL.Path == "/api/v1/ingestion/packets" {
			packets.ServeHTTP(w, r)
			return
		}
		const eventPrefix = "/api/v1/devices/"
		if strings.HasPrefix(r.URL.Path, eventPrefix) && strings.HasSuffix(r.URL.Path, "/events") {
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, eventPrefix), "/")
			if len(parts) != 2 || !uuid(parts[0]) {
				problem(w, 400, "invalid_id")
				return
			}
			stream.ServeDevice(w, r, parts[0])
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if r.URL.Path == "/healthz" {
			if r.Method != "GET" {
				problem(w, 405, "method_not_allowed")
				return
			}
			respond(w, 200, map[string]string{"status": "ok"})
			return
		}
		if r.URL.Path == "/readyz" {
			if r.Method != "GET" {
				problem(w, 405, "method_not_allowed")
				return
			}
			if storage.Ready(ctx, p) != nil {
				problem(w, 503, "not_ready")
				return
			}
			respond(w, 200, map[string]string{"status": "ready"})
			return
		}
		const collection = "/api/v1/devices"
		if r.URL.Path != collection && !strings.HasPrefix(r.URL.Path, collection+"/") {
			problem(w, 404, "not_found")
			return
		}
		if storage.Ready(ctx, p) != nil {
			problem(w, 503, "not_ready")
			return
		}
		principal, err := resolve(ctx, r)
		if err != nil {
			if errors.Is(err, identity.ErrUnauthorized) {
				problem(w, 401, "unauthorized")
				return
			}
			problem(w, 503, "identity_unavailable")
			return
		}
		if !uuid(principal.UserID) || (!principal.ExpiresAt.IsZero() && !time.Now().Before(principal.ExpiresAt)) {
			problem(w, 401, "unauthorized")
			return
		}
		if r.URL.Path == collection {
			switch r.Method {
			case "GET":
				result, err := d.List(ctx, principal)
				if handleError(w, err) {
					return
				}
				respond(w, 200, result)
			case "POST":
				var input devices.Input
				if !decode(w, r, &input) {
					return
				}
				result, err := d.Create(ctx, principal, input)
				if handleError(w, err) {
					return
				}
				w.Header().Set("Location", collection+"/"+result.ID)
				respond(w, 201, result)
			default:
				problem(w, 405, "method_not_allowed")
			}
			return
		}
		id := strings.TrimPrefix(r.URL.Path, collection+"/")
		parts := strings.Split(id, "/")
		if len(parts) >= 2 && parts[1] == "sources" {
			serveSources(ctx, w, r, sources, principal, parts)
			return
		}
		if len(parts) == 2 {
			if !uuid(parts[0]) {
				problem(w, 400, "invalid_id")
				return
			}
			serveTelemetry(ctx, w, r, readings, principal, parts[0], parts[1])
			return
		}
		if !uuid(id) {
			problem(w, 400, "invalid_id")
			return
		}
		switch r.Method {
		case "GET":
			result, err := d.Get(ctx, principal, id)
			if handleError(w, err) {
				return
			}
			respond(w, 200, result)
		case "PATCH":
			var input struct {
				Name string `json:"name"`
			}
			if !decode(w, r, &input) {
				return
			}
			result, err := d.Rename(ctx, principal, id, input.Name)
			if handleError(w, err) {
				return
			}
			respond(w, 200, result)
		case "DELETE":
			if handleError(w, d.Delete(ctx, principal, id)) {
				return
			}
			w.WriteHeader(204)
		default:
			problem(w, 405, "method_not_allowed")
		}
	})
}
func uuid(s string) bool { var u pgtype.UUID; return len(s) == 36 && u.Scan(s) == nil && u.Valid }
func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	const limit = 8192
	if r.ContentLength > limit {
		problem(w, 413, "body_too_large")
		return false
	}
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		problem(w, 415, "json_required")
		return false
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		var oversized *http.MaxBytesError
		if errors.As(err, &oversized) {
			problem(w, 413, "body_too_large")
		} else {
			problem(w, 400, "invalid_body")
		}
		return false
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err = dec.Decode(target); err != nil {
		problem(w, 400, "invalid_json")
		return false
	}
	if err = dec.Decode(new(any)); err != io.EOF {
		problem(w, 400, "invalid_json")
		return false
	}
	return true
}
func handleError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, devices.ErrNotFound):
		problem(w, 404, "not_found")
	case errors.Is(err, devices.ErrInvalid):
		problem(w, 400, "invalid_device")
	case errors.Is(err, telemetry.ErrQuery):
		problem(w, 400, "invalid_query")
	case errors.Is(err, telemetry.ErrSnapshotUnavailable):
		problem(w, 404, "snapshot_unavailable")
	default:
		problem(w, 503, "storage_unavailable")
	}
	return true
}
func problem(w http.ResponseWriter, status int, code string) {
	respond(w, status, map[string]any{"error": map[string]string{"code": code}})
}
func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
