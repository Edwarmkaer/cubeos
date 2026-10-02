package ingestion

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
)

type IngestResult struct {
	Status      string `json:"status"`
	Cause       string `json:"cause"`
	ReceptionID int64  `json:"receptionId"`
	Revision    int64  `json:"revision"`
	Epoch       *int64 `json:"receptionEpoch"`
}

// PacketRepository is the transactional port required by the ingestion consumer.
// SourceID must come from the authenticated adapter, never from packet.id.
type PacketRepository interface {
	Store(context.Context, string, Reception) (IngestResult, error)
}
type Reception struct {
	Raw           []byte
	RawSize       int64
	RawHash       string
	CanonicalHash string
	Patch         telemetry.Patch
	Metadata      telemetry.ReceiverMetadata
	Cause         string
}
type Service struct{ repository PacketRepository }

func NewService(r PacketRepository) *Service { return &Service{r} }
func (s *Service) Ingest(ctx context.Context, sourceID string, rawPayload []byte, metadata telemetry.ReceiverMetadata) (IngestResult, error) {
	r := Reception{RawSize: int64(len(rawPayload)), RawHash: fmt.Sprintf("%x", sha256.Sum256(rawPayload)), Metadata: metadata}
	raw := rawPayload
	if len(raw) > MaxPayloadBytes {
		raw = raw[:MaxPayloadBytes]
		r.Cause = "payload_too_large"
	}
	r.Raw = append([]byte(nil), raw...)
	if r.Cause == "" {
		p, err := Validate(rawPayload)
		if err != nil {
			r.Cause = "invalid_uplink"
		} else {
			r.Patch = Normalize(p)
			canonical, _ := json.Marshal(p)
			r.CanonicalHash = fmt.Sprintf("%x", sha256.Sum256(canonical))
		}
	}
	if !metadata.Valid() {
		r.Cause = "invalid_receiver_metadata"
		r.Metadata = telemetry.ReceiverMetadata{}
	}
	return s.repository.Store(ctx, sourceID, r)
}
