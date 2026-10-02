package ingestion

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"time"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(p *pgxpool.Pool) *Repository { return &Repository{p} }
func (r *Repository) Store(ctx context.Context, sourceID string, input Reception) (IngestResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return IngestResult{}, err
	}
	defer tx.Rollback(context.Background())
	result := IngestResult{Status: "rejected", Cause: input.Cause}
	var device, source *string
	var protocol string
	var revoked *time.Time
	var gateway *string
	var u pgtype.UUID
	if len(sourceID) == 36 && u.Scan(sourceID) == nil && u.Valid {
		var d, s string
		err = tx.QueryRow(ctx, "SELECT id::text,device_id::text,revoked_at,external_gateway_id FROM ingestion_sources WHERE id=$1 FOR SHARE", sourceID).Scan(&s, &d, &revoked, &gateway)
		if err == nil {
			device = &d
			source = &s
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return result, err
		}
	}
	if device == nil {
		result.Cause = "source_not_found"
	} else {
		// Device row serializes ALL receptions and rebuilds across API processes.
		if err = tx.QueryRow(ctx, "SELECT protocol_device_id FROM devices WHERE id=$1 FOR UPDATE", *device).Scan(&protocol); err != nil {
			return result, err
		}
		if revoked != nil {
			result.Cause = "source_revoked"
		}
	}
	input.Metadata.GatewayID = gateway
	var now time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return result, err
	}
	var state telemetry.OrderState
	var projection telemetry.Projection
	var revision int64
	if device != nil {
		if _, err = tx.Exec(ctx, "INSERT INTO device_telemetry_state(device_id) VALUES($1) ON CONFLICT DO NOTHING", *device); err != nil {
			return result, err
		}
		var b []byte
		if err = tx.QueryRow(ctx, "SELECT revision,order_state FROM device_telemetry_state WHERE device_id=$1", *device).Scan(&revision, &b); err != nil {
			return result, err
		}
		if err = json.Unmarshal(b, &state); err != nil {
			return result, err
		}
		result.Revision = revision
	}
	var logical, projected, advance bool
	if result.Cause == "" && input.Patch.DeviceID() != protocol {
		result.Cause = "device_mismatch"
	}
	if result.Cause == "" {
		// Exact evidence from any previous epoch takes precedence over heuristics:
		// delayed retransmissions cannot become a new restart candidate.
		var epoch int64
		err = tx.QueryRow(ctx, "SELECT reception_epoch FROM received_packets WHERE device_id=$1 AND message_type=$2 AND sequence=$3 AND canonical_sha256=$4 AND logical ORDER BY id DESC LIMIT 1", *device, input.Patch.Group(), int64(input.Patch.Sequence()), input.CanonicalHash).Scan(&epoch)
		if err == nil {
			result.Status = "duplicated"
			result.Cause = "retransmission"
			result.Epoch = &epoch
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return result, err
		} else {
			prior := state
			decision := state.Observe(input.Patch.Sequence(), input.Patch.Uptime(), input.Patch.Group() == "H" && input.Patch["missionState"] == "BOOT", now)
			result.Cause = decision.Kind
			if decision.Kind == "project" || decision.Kind == "late" {
				result.Epoch = &decision.Epoch
				var hash string
				err = tx.QueryRow(ctx, "SELECT canonical_sha256 FROM received_packets WHERE device_id=$1 AND reception_epoch=$2 AND message_type=$3 AND sequence=$4 AND logical", *device, decision.Epoch, input.Patch.Group(), int64(input.Patch.Sequence())).Scan(&hash)
				if err == nil {
					result.Cause = "sequence_conflict"
					state = prior
				} else if !errors.Is(err, pgx.ErrNoRows) {
					return result, err
				} else {
					result.Status = "accepted"
					logical = true
					advance = decision.Kind == "project"
				}
			}
			// Persist candidate and frontier even when a restart candidate is rejected;
			// it is explicit bounded evidence, not an inferred firmware boot identity.
			b, err := json.Marshal(state)
			if err != nil {
				return result, err
			}
			if _, err = tx.Exec(ctx, "UPDATE device_telemetry_state SET order_state=$2 WHERE device_id=$1", *device, b); err != nil {
				return result, err
			}
		}
	}
	if logical {
		projection, err = telemetry.LoadProjection(ctx, tx, *device)
		if errors.Is(err, pgx.ErrNoRows) && revision == 0 {
			projection = telemetry.Projection{}
		} else if err != nil {
			return result, err
		}
		if projection.Revision != revision {
			return result, errors.New("snapshot revision differs; rebuild required")
		}
		projected = projection.ApplyReception(input.Patch, now, input.Metadata, *result.Epoch, advance)
		result.Revision = projection.Revision
	}
	var group any
	var sequence, uptime any
	var normalized any
	var epoch any
	if input.Patch != nil {
		group = input.Patch.Group()
		sequence = int64(input.Patch.Sequence())
		uptime = int64(input.Patch.Uptime())
		normalized, err = json.Marshal(input.Patch)
		if err != nil {
			return result, err
		}
		epoch = result.Epoch
	}
	metadata, err := json.Marshal(input.Metadata)
	if err != nil {
		return result, err
	}
	attempted := sourceID
	if len(attempted) > 128 {
		attempted = fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(sourceID)))
	}
	attempted = strings.ReplaceAll(strings.ToValidUTF8(attempted, "?"), "\x00", "?")
	err = tx.QueryRow(ctx, `INSERT INTO received_packets(device_id,source_id,attempted_source,received_at,raw_payload,raw_size,raw_truncated,raw_sha256,canonical_sha256,status,cause,reception_epoch,message_type,sequence,uptime_ms,normalized_payload,receiver_metadata,logical,projected)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`, device, source, attempted, now, input.Raw, input.RawSize, input.RawSize > int64(len(input.Raw)), input.RawHash, input.CanonicalHash, result.Status, result.Cause, epoch, group, sequence, uptime, normalized, metadata, logical, projected).Scan(&result.ReceptionID)
	if err != nil {
		return result, err
	}
	if projected {
		b, err := json.Marshal(projection)
		if err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO device_snapshots(device_id,projection,updated_at) VALUES($1,$2,$3) ON CONFLICT(device_id) DO UPDATE SET projection=excluded.projection,updated_at=excluded.updated_at", *device, b, now); err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, "UPDATE device_telemetry_state SET revision=$2 WHERE device_id=$1", *device, result.Revision); err != nil {
			return result, err
		}
		// PostgreSQL delivers this hint only after COMMIT, across API processes.
		// No raw payload or session/source credentials leave this transaction.
		if _, err = tx.Exec(ctx, "SELECT pg_notify($1,$2)", realtime.Channel, *device); err != nil {
			return result, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return IngestResult{}, err
	}
	return result, nil
}
