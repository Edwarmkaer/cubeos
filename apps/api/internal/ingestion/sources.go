package ingestion

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrCredential = errors.New("invalid source credential")

type SourceInput struct {
	Transport string `json:"transport"`
	GatewayID string `json:"gatewayId,omitempty"`
}
type Source struct {
	ID        string     `json:"id"`
	DeviceID  string     `json:"deviceId"`
	Transport string     `json:"transport"`
	GatewayID *string    `json:"gatewayId"`
	RevokedAt *time.Time `json:"revokedAt"`
}
type ProvisionedSource struct {
	Source
	Credential string `json:"credential"`
}
type Sources struct{ pool *pgxpool.Pool }

func NewSources(p *pgxpool.Pool) *Sources { return &Sources{p} }
func sourceUUID(s string) bool            { var u pgtype.UUID; return len(s) == 36 && u.Scan(s) == nil && u.Valid }
func (s *Sources) Create(ctx context.Context, p identity.Principal, device string, input SourceInput) (ProvisionedSource, error) {
	var result ProvisionedSource
	if !sourceUUID(device) || !sourceUUID(p.UserID) {
		return result, devices.ErrNotFound
	}
	if input.Transport != "http" && input.Transport != "serial" || len(input.GatewayID) > 128 || strings.ContainsAny(input.GatewayID, "\x00\r\n") {
		return result, devices.ErrInvalid
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return result, err
	}
	result.Credential = hex.EncodeToString(secret)
	hash := sha256.Sum256([]byte(result.Credential))
	var gateway *string
	if input.GatewayID != "" {
		gateway = &input.GatewayID
	}
	// The row lock serializes bounded provisioning with device deletion.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProvisionedSource{}, err
	}
	defer tx.Rollback(context.Background())
	var owned string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM devices WHERE id=$1 AND owner_user_id=$2 FOR UPDATE", device, p.UserID).Scan(&owned); errors.Is(err, pgx.ErrNoRows) {
		return ProvisionedSource{}, devices.ErrNotFound
	} else if err != nil {
		return ProvisionedSource{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM ingestion_sources WHERE device_id=$1 AND revoked_at IS NULL", device).Scan(&count); err != nil {
		return ProvisionedSource{}, err
	}
	if count >= 32 {
		return ProvisionedSource{}, devices.ErrInvalid
	}
	err = tx.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,external_gateway_id,credential_hash) VALUES($1,$2,$3,$4) RETURNING id::text,device_id::text,transport,external_gateway_id,revoked_at", device, input.Transport, gateway, hex.EncodeToString(hash[:])).Scan(&result.ID, &result.DeviceID, &result.Transport, &result.GatewayID, &result.RevokedAt)
	if err != nil {
		return ProvisionedSource{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ProvisionedSource{}, err
	}
	return result, nil
}
func (s *Sources) List(ctx context.Context, p identity.Principal, device string) ([]Source, error) {
	if _, err := devices.NewRepository(s.pool).Get(ctx, p, device); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, "SELECT s.id::text,s.device_id::text,s.transport,s.external_gateway_id,s.revoked_at FROM ingestion_sources s JOIN devices d ON d.id=s.device_id WHERE s.device_id=$1 AND d.owner_user_id=$2 ORDER BY s.revoked_at NULLS FIRST,s.id LIMIT 128", device, p.UserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Source{}
	for rows.Next() {
		var v Source
		if err = rows.Scan(&v.ID, &v.DeviceID, &v.Transport, &v.GatewayID, &v.RevokedAt); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}
func (s *Sources) Revoke(ctx context.Context, p identity.Principal, device, id string) error {
	if !sourceUUID(device) || !sourceUUID(id) || !sourceUUID(p.UserID) {
		return devices.ErrNotFound
	}
	tag, err := s.pool.Exec(ctx, "UPDATE ingestion_sources s SET revoked_at=COALESCE(s.revoked_at,clock_timestamp()) FROM devices d WHERE s.id=$1 AND s.device_id=$2 AND d.id=s.device_id AND d.owner_user_id=$3", id, device, p.UserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return devices.ErrNotFound
	}
	return nil
}
func (s *Sources) Authenticate(ctx context.Context, credential string) (string, error) {
	if len(credential) != 64 {
		return "", ErrCredential
	}
	if _, err := hex.DecodeString(credential); err != nil {
		return "", ErrCredential
	}
	hash := sha256.Sum256([]byte(credential))
	var id string
	err := s.pool.QueryRow(ctx, "SELECT s.id::text FROM ingestion_sources s JOIN devices d ON d.id=s.device_id WHERE credential_hash=$1 AND transport='http' AND revoked_at IS NULL", hex.EncodeToString(hash[:])).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrCredential
	}
	return id, err
}
func (s *Sources) ActiveSerial(ctx context.Context, p identity.Principal, id string) (Source, error) {
	var result Source
	if !sourceUUID(id) || !sourceUUID(p.UserID) {
		return result, devices.ErrNotFound
	}
	err := s.pool.QueryRow(ctx, "SELECT s.id::text,s.device_id::text,s.transport,s.external_gateway_id,s.revoked_at FROM ingestion_sources s JOIN devices d ON d.id=s.device_id WHERE s.id=$1 AND d.owner_user_id=$2 AND s.transport='serial' AND s.revoked_at IS NULL", id, p.UserID).Scan(&result.ID, &result.DeviceID, &result.Transport, &result.GatewayID, &result.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		err = devices.ErrNotFound
	}
	return result, err
}
