package http

import (
	"context"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type TelemetryStore interface {
	GetSnapshot(context.Context, identity.Principal, string) (telemetry.Projection, error)
	ListPackets(context.Context, identity.Principal, string, telemetry.Filter, string, int) (telemetry.Page, error)
}

func serveTelemetry(ctx context.Context, w http.ResponseWriter, r *http.Request, store TelemetryStore, p identity.Principal, id, resource string) {
	if resource != "snapshot" && resource != "packets" && resource != "packets.csv" {
		problem(w, 404, "not_found")
		return
	}
	if r.Method != "GET" {
		problem(w, 405, "method_not_allowed")
		return
	}
	if resource == "snapshot" {
		if r.URL.RawQuery != "" {
			problem(w, 400, "invalid_query")
			return
		}
		s, err := store.GetSnapshot(ctx, p, id)
		if handleError(w, err) {
			return
		}
		respond(w, 200, s)
		return
	}
	query, err := parsePacketQuery(r)
	if handleError(w, err) {
		return
	}
	if resource == "packets.csv" && query.filter.Group == "" {
		problem(w, 400, "group_required")
		return
	}
	page, err := store.ListPackets(ctx, p, id, query.filter, query.cursor, query.limit)
	if handleError(w, err) {
		return
	}
	if resource == "packets" {
		respond(w, 200, page)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="telemetry-`+query.filter.Group+`.csv"`)
	w.Header().Set("X-Next-Cursor", page.NextCursor)
	w.Header().Set("X-History-Watermark", strconv.FormatInt(page.Watermark, 10))
	w.Header().Set("Access-Control-Expose-Headers", "X-Next-Cursor, X-History-Watermark")
	// Page is bounded before headers are sent. CSV writes/cancellation stop at
	// the first error; no unbounded scan or cross-group filling is possible.
	_ = telemetry.WriteCSV(ctx, w, query.filter.Group, page.Packets)
}

type packetQuery struct {
	filter telemetry.Filter
	cursor string
	limit  int
}

func parsePacketQuery(r *http.Request) (packetQuery, error) {
	q, err := url.ParseQuery(r.URL.RawQuery)
	result := packetQuery{limit: 100}
	if err != nil {
		return result, telemetry.ErrQuery
	}
	for k, v := range q {
		if len(v) != 1 || v[0] == "" {
			return result, telemetry.ErrQuery
		}
		switch k {
		case "m", "from", "to", "cursor", "limit":
		default:
			return result, telemetry.ErrQuery
		}
	}
	result.filter.Group = q.Get("m")
	result.cursor = q.Get("cursor")
	if value := q.Get("limit"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 200 {
			return result, telemetry.ErrQuery
		}
		result.limit = n
	}
	for k, target := range map[string]**time.Time{"from": &result.filter.From, "to": &result.filter.To} {
		if v := q.Get(k); v != "" {
			at, err := time.Parse(time.RFC3339Nano, v)
			if err != nil || at.Year() < 1 || at.Year() > 9999 {
				return result, telemetry.ErrQuery
			}
			at = at.UTC()
			*target = &at
		}
	}
	if !result.filter.Valid() {
		return result, telemetry.ErrQuery
	}
	return result, nil
}
