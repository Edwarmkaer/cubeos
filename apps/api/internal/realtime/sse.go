package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"net/http"
	"time"
)

var ErrUnauthorized = errors.New("session unauthorized")

type Load func(context.Context, *http.Request, string) (identity.Principal, telemetry.Projection, error)
type SSE struct {
	Hub                                       *Hub
	Load                                      Load
	Heartbeat, OperationTimeout, WriteTimeout time.Duration
}

func NewSSE(h *Hub, load Load) *SSE {
	return &SSE{h, load, 15 * time.Second, 5 * time.Second, 5 * time.Second}
}

type SnapshotEvent struct {
	Revision         int64                          `json:"revision"`
	Snapshot         telemetry.Object               `json:"snapshot"`
	FreshnessByGroup map[string]telemetry.Freshness `json:"freshnessByGroup"`
}

func (s *SSE) ServeDevice(w http.ResponseWriter, r *http.Request, id string) {
	problem := func(status int, code string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code}})
	}
	if r.Method != "GET" {
		problem(405, "method_not_allowed")
		return
	}
	if r.URL.RawQuery != "" {
		problem(400, "invalid_query")
		return
	}
	// Subscribe before the read: a racing commit is either in the snapshot or
	// leaves an invalidation for the next read. Queues contain one hint only.
	updates, unsubscribe := s.Hub.Subscribe(id)
	defer unsubscribe()
	load := func() (identity.Principal, telemetry.Projection, error) {
		ctx, cancel := context.WithTimeout(r.Context(), s.OperationTimeout)
		defer cancel()
		return s.Load(ctx, r, id)
	}
	principal, snapshot, err := load()
	if err != nil && !errors.Is(err, telemetry.ErrSnapshotUnavailable) {
		switch {
		case errors.Is(err, devices.ErrNotFound):
			problem(404, "not_found")
		case errors.Is(err, ErrUnauthorized):
			problem(401, "unauthorized")
		default:
			problem(503, "storage_unavailable")
		}
		return
	}
	if principal.UserID == "" || (!principal.ExpiresAt.IsZero() && !time.Now().Before(principal.ExpiresAt)) {
		problem(401, "unauthorized")
		return
	}
	controller := http.NewResponseController(w)
	// net/http writes the final chunk after the handler returns. An idle stream
	// can exit well after its last per-write deadline; refresh that deadline so
	// TLS can complete the response without a truncated/malformed final record.
	defer func() { _ = controller.SetWriteDeadline(time.Now().Add(s.WriteTimeout)) }()
	// Replace server's finite REST write timeout with a fresh deadline per write.
	write := func(message string) error {
		if err := controller.SetWriteDeadline(time.Now().Add(s.WriteTimeout)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			return err
		}
		if _, err := fmt.Fprint(w, message); err != nil {
			return err
		}
		return controller.Flush()
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	var revision int64
	send := func(p telemetry.Projection) error {
		if p.Revision <= revision {
			return nil
		}
		data, err := json.Marshal(SnapshotEvent{p.Revision, p.Snapshot, p.FreshnessByGroup})
		if err != nil {
			return err
		}
		if err = write(fmt.Sprintf("id: %s:%d\nevent: snapshot\ndata: %s\n\n", id, p.Revision, data)); err != nil {
			return err
		}
		revision = p.Revision
		return nil
	}
	if snapshot.Revision > 0 {
		if err = send(snapshot); err != nil {
			return
		}
	} else if write(": connected\n\n") != nil {
		return
	}
	ticker := time.NewTicker(s.Heartbeat)
	defer ticker.Stop()
	var expiry <-chan time.Time
	if !principal.ExpiresAt.IsZero() {
		timer := time.NewTimer(time.Until(principal.ExpiresAt))
		defer timer.Stop()
		expiry = timer.C
	}
	for {
		heartbeat := false
		select {
		case <-r.Context().Done():
			return
		case <-expiry:
			return
		case _, ok := <-updates:
			if !ok {
				return
			}
		case <-ticker.C:
			heartbeat = true
		}
		current, p, e := load()
		if current.UserID != principal.UserID || (!current.ExpiresAt.IsZero() && !time.Now().Before(current.ExpiresAt)) || (e != nil && !errors.Is(e, telemetry.ErrSnapshotUnavailable)) {
			return
		}
		// A resolver may revoke or shorten a session, never silently prolong it.
		if !current.ExpiresAt.IsZero() && (principal.ExpiresAt.IsZero() || current.ExpiresAt.Before(principal.ExpiresAt)) {
			return
		}
		if e == nil {
			if send(p) != nil {
				return
			}
		}
		if heartbeat && write(": heartbeat\n\n") != nil {
			return
		}
	}
}
