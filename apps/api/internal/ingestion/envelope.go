package ingestion

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
)

// MaxEnvelopeBytes bounds transport overhead separately from the intact payload.
const MaxEnvelopeBytes = 16384

// uniqueObject rejects duplicate keys and excessive nesting before struct decoding.
func uniqueJSON(d *json.Decoder, depth int) error {
	if depth > 16 {
		return ErrInvalid
	}
	tok, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := tok.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		keys := map[string]bool{}
		for d.More() {
			tok, err = d.Token()
			if err != nil {
				return err
			}
			k, ok := tok.(string)
			if !ok || keys[k] {
				return ErrInvalid
			}
			keys[k] = true
			if err = uniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err = uniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return ErrInvalid
	}
	_, err = d.Token()
	return err
}
func (s *Service) rejectFrame(ctx context.Context, source string, raw []byte, size int64, hash, cause string) (IngestResult, error) {
	return s.repository.Store(ctx, source, Reception{Raw: append([]byte(nil), raw[:min(len(raw), MaxPayloadBytes)]...), RawSize: size, RawHash: hash, Cause: cause})
}
func (s *Service) IngestEnvelope(ctx context.Context, source string, raw []byte) (IngestResult, error) {
	reject := func(cause string) (IngestResult, error) {
		return s.rejectFrame(ctx, source, raw, int64(len(raw)), fmt.Sprintf("%x", sha256.Sum256(raw)), cause)
	}
	if len(raw) > MaxEnvelopeBytes {
		return reject("envelope_too_large")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := uniqueJSON(d, 0); err != nil {
		return reject("invalid_envelope")
	}
	if d.Decode(new(any)) != io.EOF {
		return reject("invalid_envelope")
	}
	var env struct {
		Version  int             `json:"envelopeVersion"`
		Payload  json.RawMessage `json:"payload"`
		Receiver json.RawMessage `json:"receiver"`
	}
	d = json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(&env) != nil || env.Version != 1 || len(env.Payload) == 0 || bytes.Equal(bytes.TrimSpace(env.Payload), []byte("null")) {
		return reject("invalid_envelope")
	}
	var meta telemetry.ReceiverMetadata
	if len(env.Receiver) > 0 {
		var fields map[string]json.RawMessage
		if json.Unmarshal(env.Receiver, &fields) != nil {
			return reject("invalid_envelope")
		}
		for _, v := range fields {
			if bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
				return reject("invalid_envelope")
			}
		}
		if bytes.Equal(bytes.TrimSpace(env.Receiver), []byte("null")) {
			return reject("invalid_envelope")
		}
		d = json.NewDecoder(bytes.NewReader(env.Receiver))
		d.DisallowUnknownFields()
		if d.Decode(&meta) != nil {
			return reject("invalid_envelope")
		}
	}
	return s.Ingest(ctx, source, env.Payload, meta)
}
