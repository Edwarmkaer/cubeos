package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/construction"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"net/http"
)

func serveConstruction(ctx context.Context, w http.ResponseWriter, r *http.Request, repo *construction.Repository, p identity.Principal, parts []string) {
	if !uuid(parts[0]) {
		problem(w, 400, "invalid_id")
		return
	}
	if len(parts) == 2 && parts[1] == "progress" {
		if r.Method != "GET" {
			problem(w, 405, "method_not_allowed")
			return
		}
		result, err := repo.Get(ctx, p, parts[0])
		if !handleError(w, err) {
			respond(w, 200, result)
		}
		return
	}
	if len(parts) != 3 || parts[1] != "steps" {
		problem(w, 404, "not_found")
		return
	}
	if !uuid(parts[2]) {
		problem(w, 400, "invalid_id")
		return
	}
	if r.Method != "PUT" {
		problem(w, 405, "method_not_allowed")
		return
	}
	// Decode the object as raw JSON: Go struct decoding otherwise accepts casing
	// aliases and null booleans. Duplicates are rejected by the custom decoder.
	var input completionInput
	if !decode(w, r, &input) {
		return
	}
	result, err := repo.Set(ctx, p, parts[0], parts[2], input.Completed)
	if !handleError(w, err) {
		respond(w, 200, result)
	}
}

type completionInput struct{ Completed bool }

func (i *completionInput) UnmarshalJSON(raw []byte) error {
	// A single exact key and a JSON boolean are the entire input contract.
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return err
	}
	if len(obj) != 1 {
		return errors.New("completion object required")
	}
	v, ok := obj["completed"]
	if !ok || (string(v) != "true" && string(v) != "false") {
		return errors.New("boolean required")
	}
	// Count root members with the decoder, preserving duplicate key evidence.
	var members int
	dec := json.NewDecoder(bytes.NewReader(raw))
	if _, err := dec.Token(); err != nil {
		return err
	}
	for dec.More() {
		if _, err := dec.Token(); err != nil {
			return err
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return err
		}
		members++
	}
	if members != 1 {
		return errors.New("duplicate completed")
	}
	i.Completed = string(v) == "true"
	return nil
}
