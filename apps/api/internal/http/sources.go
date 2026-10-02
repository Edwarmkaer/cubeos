package http

import (
	"context"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"net/http"
)

func serveSources(ctx context.Context, w http.ResponseWriter, r *http.Request, s *ingestion.Sources, p identity.Principal, parts []string) {
	if !uuid(parts[0]) {
		problem(w, 400, "invalid_id")
		return
	}
	if len(parts) == 3 && r.Method == "DELETE" {
		if !uuid(parts[2]) {
			problem(w, 400, "invalid_id")
			return
		}
		if handleError(w, s.Revoke(ctx, p, parts[0], parts[2])) {
			return
		}
		w.WriteHeader(204)
		return
	}
	if len(parts) != 2 {
		problem(w, 404, "not_found")
		return
	}
	switch r.Method {
	case "GET":
		result, err := s.List(ctx, p, parts[0])
		if !handleError(w, err) {
			respond(w, 200, result)
		}
	case "POST":
		var input ingestion.SourceInput
		if !decode(w, r, &input) {
			return
		}
		result, err := s.Create(ctx, p, parts[0], input)
		if !handleError(w, err) {
			respond(w, 201, result)
		}
	default:
		problem(w, 405, "method_not_allowed")
	}
}
