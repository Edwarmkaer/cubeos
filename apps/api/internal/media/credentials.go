package media

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"time"
)

var ErrCredential = errors.New("invalid media credential")

type Access struct {
	Principal    identity.Principal
	CredentialID string
	Revalidate   func(context.Context) error
}
type Credential struct {
	ID        string     `json:"id"`
	DeviceID  string     `json:"deviceId"`
	RevokedAt *time.Time `json:"revokedAt"`
	Secret    string     `json:"credential,omitempty"`
}

func (s *Service) CreateCredential(ctx context.Context, p identity.Principal, device string) (Credential, error) {
	var c Credential
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return c, err
	}
	c.Secret = "media_" + hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(c.Secret))
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Credential{}, err
	}
	defer tx.Rollback(context.Background())
	var id string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM devices WHERE id=$1 AND owner_user_id=$2 FOR UPDATE", device, p.UserID).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return Credential{}, devices.ErrNotFound
	} else if err != nil {
		return Credential{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM media_credentials WHERE device_id=$1 AND revoked_at IS NULL", device).Scan(&count); err != nil {
		return Credential{}, err
	}
	if count >= 32 {
		return Credential{}, ErrLimit
	}
	err = tx.QueryRow(ctx, "INSERT INTO media_credentials(device_id,owner_user_id,credential_hash) VALUES($1,$2,$3) RETURNING id::text,device_id::text", device, p.UserID, hex.EncodeToString(hash[:])).Scan(&c.ID, &c.DeviceID)
	if err != nil {
		return Credential{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Credential{}, err
	}
	return c, nil
}
func (s *Service) Authenticate(ctx context.Context, device, secret string) (Access, error) {
	var a Access
	if len(secret) != 70 || secret[:6] != "media_" {
		return a, ErrCredential
	}
	hash := sha256.Sum256([]byte(secret))
	err := s.pool.QueryRow(ctx, "SELECT c.id::text,d.owner_user_id::text FROM media_credentials c JOIN devices d ON d.id=c.device_id WHERE c.credential_hash=$1 AND c.device_id=$2 AND c.revoked_at IS NULL AND c.owner_user_id=d.owner_user_id", hex.EncodeToString(hash[:]), device).Scan(&a.CredentialID, &a.Principal.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Access{}, ErrCredential
	}
	return a, err
}
func (s *Service) RevokeCredential(ctx context.Context, p identity.Principal, device, id string) error {
	tag, err := s.pool.Exec(ctx, "UPDATE media_credentials c SET revoked_at=COALESCE(c.revoked_at,clock_timestamp()) FROM devices d WHERE c.id=$1 AND c.device_id=$2 AND d.id=c.device_id AND d.owner_user_id=$3", id, device, p.UserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return devices.ErrNotFound
	}
	return nil
}
