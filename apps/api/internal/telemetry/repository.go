package telemetry

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"time"
)

var ErrQuery = errors.New("invalid telemetry query")
var ErrSnapshotUnavailable = errors.New("snapshot unavailable")

type Filter struct {
	Group string     `json:"group,omitempty"`
	From  *time.Time `json:"from,omitempty"`
	To    *time.Time `json:"to,omitempty"`
}

func (f Filter) Valid() bool {
	return (f.Group == "" || f.Group == "H" || f.Group == "E" || f.Group == "O" || f.Group == "I" || f.Group == "G") && (f.From == nil || f.To == nil || !f.From.After(*f.To))
}

type Packet struct {
	ID           int64     `json:"id"`
	ReceivedAt   time.Time `json:"receivedAt"`
	Status       string    `json:"status"`
	Cause        string    `json:"cause"`
	Epoch        *int64    `json:"receptionEpoch"`
	Group        *string   `json:"messageType"`
	Sequence     *int64    `json:"sequence"`
	Uptime       *int64    `json:"uptimeMs"`
	Raw          []byte    `json:"rawBase64"`
	RawSize      int64     `json:"rawSize"`
	RawTruncated bool      `json:"rawTruncated"`
	RawHash      string    `json:"rawSha256"`
	Normalized   Patch     `json:"normalized,omitempty"`
	Logical      bool      `json:"logicalSample"`
	Projected    bool      `json:"projected"`
}
type Page struct {
	Packets    []Packet `json:"packets"`
	NextCursor string   `json:"nextCursor,omitempty"`
	Watermark  int64    `json:"watermark"`
}
type cursor struct {
	Version   int    `json:"v"`
	Device    string `json:"device"`
	Filter    Filter `json:"filter"`
	After     int64  `json:"after"`
	Watermark int64  `json:"watermark"`
}
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(p *pgxpool.Pool) *Repository { return &Repository{p} }
func validUUID(s string) bool {
	var id pgtype.UUID
	return len(s) == 36 && id.Scan(s) == nil && id.Valid
}
func owned(ctx context.Context, tx pgx.Tx, p identity.Principal, id string, lock bool) error {
	if !validUUID(id) || !validUUID(p.UserID) {
		return devices.ErrNotFound
	}
	query := "SELECT id::text FROM devices WHERE id=$1 AND owner_user_id=$2"
	if lock {
		query += " FOR UPDATE"
	}
	var found string
	err := tx.QueryRow(ctx, query, id, p.UserID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return devices.ErrNotFound
	}
	return err
}
func (r *Repository) GetSnapshot(ctx context.Context, p identity.Principal, id string) (Projection, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Projection{}, err
	}
	defer tx.Rollback(context.Background())
	if err = owned(ctx, tx, p, id, false); err != nil {
		return Projection{}, err
	}
	s, err := LoadProjection(ctx, tx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Projection{}, ErrSnapshotUnavailable
	}
	if err != nil {
		return Projection{}, err
	}
	return s, tx.Commit(ctx)
}
func (r *Repository) ListPackets(ctx context.Context, p identity.Principal, id string, f Filter, token string, limit int) (Page, error) {
	if !f.Valid() || limit < 1 || limit > 200 {
		return Page{}, ErrQuery
	}
	c := cursor{Version: 1, Device: id, Filter: f}
	if token != "" {
		if len(token) > 2048 {
			return Page{}, ErrQuery
		}
		b, err := base64.RawURLEncoding.DecodeString(token)
		if err != nil {
			return Page{}, ErrQuery
		}
		d := json.NewDecoder(bytes.NewReader(b))
		d.DisallowUnknownFields()
		if err = d.Decode(&c); err != nil {
			return Page{}, ErrQuery
		}
		if d.Decode(new(any)) != io.EOF {
			return Page{}, ErrQuery
		}
		want, _ := json.Marshal(f)
		got, _ := json.Marshal(c.Filter)
		if c.Version != 1 || c.Device != id || !bytes.Equal(want, got) || !c.Filter.Valid() || c.After < 1 || c.Watermark < c.After {
			return Page{}, ErrQuery
		}
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Page{}, err
	}
	defer tx.Rollback(context.Background())
	if err = owned(ctx, tx, p, id, false); err != nil {
		return Page{}, err
	}
	var highest int64
	if err = tx.QueryRow(ctx, "SELECT coalesce(max(id),0) FROM received_packets WHERE device_id=$1", id).Scan(&highest); err != nil {
		return Page{}, err
	}
	if token == "" {
		c.Watermark = highest
	} else if c.Watermark > highest {
		return Page{}, ErrQuery
	}
	rows, err := tx.Query(ctx, `SELECT id,received_at,status,cause,reception_epoch,message_type,sequence,uptime_ms,raw_payload,raw_size,raw_truncated,raw_sha256,normalized_payload,logical,projected
 FROM received_packets WHERE device_id=$1 AND id>$2 AND id<=$3 AND ($4='' OR message_type=$4) AND ($5::timestamptz IS NULL OR received_at>=$5) AND ($6::timestamptz IS NULL OR received_at<=$6) ORDER BY id LIMIT $7`, id, c.After, c.Watermark, f.Group, f.From, f.To, limit+1)
	if err != nil {
		return Page{}, err
	}
	page := Page{Packets: []Packet{}, Watermark: c.Watermark}
	for rows.Next() {
		var packet Packet
		var normalized []byte
		if err = rows.Scan(&packet.ID, &packet.ReceivedAt, &packet.Status, &packet.Cause, &packet.Epoch, &packet.Group, &packet.Sequence, &packet.Uptime, &packet.Raw, &packet.RawSize, &packet.RawTruncated, &packet.RawHash, &normalized, &packet.Logical, &packet.Projected); err != nil {
			rows.Close()
			return Page{}, err
		}
		if normalized != nil {
			if err = json.Unmarshal(normalized, &packet.Normalized); err != nil {
				rows.Close()
				return Page{}, err
			}
		}
		packet.ReceivedAt = packet.ReceivedAt.UTC()
		page.Packets = append(page.Packets, packet)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return Page{}, err
	}
	if len(page.Packets) > limit {
		page.Packets = page.Packets[:limit]
		c.After = page.Packets[limit-1].ID
		b, err := json.Marshal(c)
		if err != nil {
			return Page{}, err
		}
		page.NextCursor = base64.RawURLEncoding.EncodeToString(b)
	}
	if err = tx.Commit(ctx); err != nil {
		return Page{}, err
	}
	return page, nil
}

// Rebuild holds the same device lock as ingestion and streams durable projection
// decisions. It preserves revision and receipt timestamps, including epochs.
func (r *Repository) Rebuild(ctx context.Context, p identity.Principal, id string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err = owned(ctx, tx, p, id, true); err != nil {
		return err
	}
	var revision int64
	err = tx.QueryRow(ctx, "SELECT revision FROM device_telemetry_state WHERE device_id=$1", id).Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSnapshotUnavailable
	}
	if err != nil {
		return err
	}
	s, err := replayProjection(ctx, tx, id)
	if err != nil {
		return err
	}
	if s.Revision != revision {
		return errors.New("projection evidence incomplete")
	}
	if s.Revision == 0 {
		return ErrSnapshotUnavailable
	}
	var updatedAt time.Time
	if err = tx.QueryRow(ctx, "SELECT received_at FROM received_packets WHERE device_id=$1 AND projected ORDER BY id DESC LIMIT 1", id).Scan(&updatedAt); err != nil {
		return err
	}
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO device_snapshots(device_id,projection,updated_at) VALUES($1,$2,$3) ON CONFLICT(device_id) DO UPDATE SET projection=excluded.projection,updated_at=excluded.updated_at", id, b, updatedAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// LoadProjection upgrades the cache's ordering provenance from persisted
// decisions when reading a PR4 cache written before per-field late merging.
// Callers must first authorize or lock the device in this transaction.
func LoadProjection(ctx context.Context, tx pgx.Tx, id string) (Projection, error) {
	var b []byte
	if err := tx.QueryRow(ctx, "SELECT projection FROM device_snapshots WHERE device_id=$1", id).Scan(&b); err != nil {
		return Projection{}, err
	}
	var s Projection
	if err := json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	if s.State.StatusEvidence == nil {
		return replayProjection(ctx, tx, id)
	}
	return s, nil
}
func replayProjection(ctx context.Context, tx pgx.Tx, id string) (Projection, error) {
	rows, err := tx.Query(ctx, "SELECT normalized_payload,received_at,receiver_metadata,reception_epoch,cause FROM received_packets WHERE device_id=$1 AND projected ORDER BY id", id)
	if err != nil {
		return Projection{}, err
	}
	defer rows.Close()
	var s Projection
	for rows.Next() {
		var patch Patch
		var meta ReceiverMetadata
		var b, m []byte
		var at time.Time
		var epoch int64
		var cause string
		if err = rows.Scan(&b, &at, &m, &epoch, &cause); err != nil {
			return s, err
		}
		if err = json.Unmarshal(b, &patch); err != nil {
			return s, err
		}
		if err = json.Unmarshal(m, &meta); err != nil {
			return s, err
		}
		if cause != "project" && cause != "late" {
			return s, errors.New("unknown projection decision")
		}
		if !s.ApplyReception(patch, at, meta, epoch, cause == "project") {
			return s, errors.New("projection decision did not change state")
		}
	}
	return s, rows.Err()
}
