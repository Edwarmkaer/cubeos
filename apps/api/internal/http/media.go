package http

import (
	"context"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/media"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func mediaPath(path string) bool {
	return strings.HasPrefix(path, "/api/v1/photos/") || (strings.HasPrefix(path, "/api/v1/devices/") && (strings.Contains(path, "/photos") || strings.Contains(path, "/media-credentials")))
}

// Explicit private machine listener: telemetry and photos share the network
// transport, while keeping credentials and every management/read route separate.
func NewIngestionHTTP(address string, packets http.Handler, photos *media.Service, maxBytes int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Host != address {
			problem(w, 403, "host_forbidden")
			return
		}
		if r.URL.Path == "/api/v1/ingestion/packets" {
			packets.ServeHTTP(w, r)
			return
		}
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
		if len(parts) != 3 || parts[0] != "devices" || parts[2] != "photos" {
			problem(w, 404, "not_found")
			return
		}
		if r.Method != "POST" {
			problem(w, 405, "method_not_allowed")
			return
		}
		if r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") != "" {
			problem(w, 403, "machine_only")
			return
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer media_") {
			problem(w, 401, "invalid_credential")
			return
		}
		serveMedia(w, r, photos, func(context.Context, *http.Request) (identity.Principal, error) {
			return identity.Principal{}, identity.ErrUnauthorized
		}, maxBytes)
	})
}
func mediaError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, media.ErrInvalid):
		problem(w, 415, "invalid_image")
	case errors.Is(err, media.ErrLimit):
		problem(w, 413, "media_limit")
	case errors.Is(err, media.ErrCredential), errors.Is(err, identity.ErrUnauthorized):
		problem(w, 401, "unauthorized")
	default:
		handleError(w, err)
	}
	return true
}

// Check the multipart ending while staging, before any pending row/object write.
type finalPart struct {
	part   *multipart.Part
	reader *multipart.Reader
}

func (f finalPart) Read(p []byte) (int, error) {
	n, err := f.part.Read(p)
	if err == io.EOF {
		if _, end := f.reader.NextPart(); end != io.EOF {
			return n, media.ErrInvalid
		}
	}
	return n, err
}
func serveMedia(w http.ResponseWriter, r *http.Request, s *media.Service, resolve Resolver, maxBytes int64) {
	if s == nil {
		problem(w, 503, "media_unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
	download := len(parts) == 3 && parts[0] == "photos" && (parts[2] == "original" || parts[2] == "thumbnail")
	collection := len(parts) == 3 && parts[0] == "devices" && parts[2] == "photos"
	credentials := len(parts) >= 3 && len(parts) <= 4 && parts[0] == "devices" && parts[2] == "media-credentials"
	if !download && !collection && !credentials {
		problem(w, 404, "not_found")
		return
	}
	if !uuid(parts[1]) || (len(parts) == 4 && !uuid(parts[3])) {
		problem(w, 400, "invalid_id")
		return
	}
	var access media.Access
	authorization := r.Header.Get("Authorization")
	if authorization != "" && !strings.Contains(authorization, ".") {
		if !collection || r.Method != "POST" || !strings.HasPrefix(authorization, "Bearer media_") {
			problem(w, 401, "unauthorized")
			return
		}
		a, err := s.Authenticate(ctx, parts[1], strings.TrimPrefix(authorization, "Bearer "))
		if mediaError(w, err) {
			return
		}
		access = a
	} else {
		p, err := resolve(ctx, r)
		if mediaError(w, err) {
			return
		}
		if !uuid(p.UserID) || (!p.ExpiresAt.IsZero() && !time.Now().Before(p.ExpiresAt)) {
			problem(w, 401, "unauthorized")
			return
		}
		access.Principal = p
		access.Revalidate = func(check context.Context) error {
			next, e := resolve(check, r)
			if e != nil {
				return e
			}
			if next.UserID != p.UserID {
				return identity.ErrUnauthorized
			}
			return nil
		}
	}
	if download {
		if r.Method != "GET" {
			problem(w, 405, "method_not_allowed")
			return
		}
		thumb := parts[2] == "thumbnail"
		p, reader, err := s.Open(ctx, access.Principal, parts[1], thumb)
		if mediaError(w, err) {
			return
		}
		defer reader.Close()
		w.Header().Set("Content-Type", p.ContentType)
		if thumb {
			w.Header().Set("Content-Type", "image/jpeg")
		} else {
			ext := "png"
			if p.ContentType == "image/jpeg" {
				ext = "jpg"
			}
			w.Header().Set("Content-Disposition", `attachment; filename="`+p.ID+"."+ext+`"`)
			w.Header().Set("Content-Length", strconv.FormatInt(p.Size, 10))
		}
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(120 * time.Second))
		w.WriteHeader(200)
		_, _ = io.Copy(w, reader)
		return
	}
	if credentials {
		if len(parts) == 3 && r.Method == "POST" {
			var input struct{}
			if !decode(w, r, &input) {
				return
			}
			c, err := s.CreateCredential(ctx, access.Principal, parts[1])
			if !mediaError(w, err) {
				respond(w, 201, c)
			}
			return
		}
		if len(parts) == 4 && r.Method == "DELETE" {
			if !mediaError(w, s.RevokeCredential(ctx, access.Principal, parts[1], parts[3])) {
				w.WriteHeader(204)
			}
			return
		}
		problem(w, 405, "method_not_allowed")
		return
	}
	if r.Method == "GET" {
		query := r.URL.Query()
		for key := range query {
			if key != "limit" && key != "cursor" || len(query[key]) != 1 {
				problem(w, 400, "invalid_query")
				return
			}
		}
		limit := 24
		if v := query.Get("limit"); v != "" {
			var err error
			limit, err = strconv.Atoi(v)
			if err != nil || limit < 1 || limit > 100 {
				problem(w, 400, "invalid_query")
				return
			}
		}
		page, err := s.List(ctx, access.Principal, parts[1], limit, query.Get("cursor"))
		if !mediaError(w, err) {
			respond(w, 200, page)
		}
		return
	}
	if r.Method != "POST" {
		problem(w, 405, "method_not_allowed")
		return
	}
	if mediaError(w, s.Authorize(ctx, access, parts[1])) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+(64<<10))
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(120 * time.Second))
	reader, err := r.MultipartReader()
	if err != nil {
		problem(w, 415, "multipart_required")
		return
	}
	part, err := reader.NextPart()
	if err != nil {
		problem(w, 400, "invalid_multipart")
		return
	}
	var captured *time.Time
	if part.FormName() == "capturedAt" && part.FileName() == "" {
		raw, e := io.ReadAll(io.LimitReader(part, 65))
		if e != nil || len(raw) > 64 {
			problem(w, 400, "invalid_capture_date")
			return
		}
		date, e := time.Parse(time.RFC3339Nano, string(raw))
		if e != nil {
			problem(w, 400, "invalid_capture_date")
			return
		}
		captured = &date
		part, err = reader.NextPart()
		if err != nil {
			problem(w, 400, "invalid_multipart")
			return
		}
	}
	if part.FormName() != "file" || part.FileName() == "" || part.Header.Get("Content-Transfer-Encoding") != "" {
		problem(w, 400, "file_required")
		return
	}
	typ, _, err := mime.ParseMediaType(part.Header.Get("Content-Type"))
	if err != nil {
		problem(w, 415, "image_mime_required")
		return
	}
	method := "manual"
	if access.CredentialID != "" {
		method = "http"
	}
	photo, err := s.Upload(ctx, access, parts[1], finalPart{part, reader}, typ, captured, method)
	var oversized *http.MaxBytesError
	if errors.As(err, &oversized) {
		problem(w, 413, "media_limit")
		return
	}
	if !mediaError(w, err) {
		respond(w, 201, photo)
	}
}
