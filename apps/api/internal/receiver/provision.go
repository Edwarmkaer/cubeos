// Package receiver provisions only explicitly requested synthetic local readers.
package receiver

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Binding struct {
	BindingID        string `json:"bindingId"`
	DeviceID         string `json:"deviceId"`
	SourceID         string `json:"sourceId"`
	ProtocolDeviceID string `json:"protocolDeviceId"`
}

func ValidID(id string) bool { var u pgtype.UUID; return len(id) == 36 && u.Scan(id) == nil && u.Valid }

// Ensure never adopts by name/protocol ID and never repairs a revoked binding.
func Ensure(ctx context.Context, pool *pgxpool.Pool, bindingID string) (Binding, error) {
	return ensure(ctx, pool, bindingID, nil)
}

// EnsureExisting refuses automatic reprovisioning after restore/replacement.
func EnsureExisting(ctx context.Context, pool *pgxpool.Pool, expected Binding) (Binding, error) {
	if !ValidID(expected.DeviceID) || !ValidID(expected.SourceID) {
		return Binding{}, errors.New("invalid expected receiver identity")
	}
	return ensure(ctx, pool, expected.BindingID, &expected)
}

func ensure(ctx context.Context, pool *pgxpool.Pool, bindingID string, expected *Binding) (Binding, error) {
	if !ValidID(bindingID) {
		return Binding{}, errors.New("invalid receiver binding ID")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	p, err := identity.Local(ctx, pool)
	if err != nil {
		return Binding{}, errors.New("local receiver identity unavailable")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Binding{}, errors.New("receiver storage unavailable")
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1::text,6172))", bindingID); err != nil {
		return Binding{}, errors.New("receiver lock unavailable")
	}
	b := Binding{BindingID: bindingID}
	var owner, sourceDevice, transport string
	var active bool
	err = tx.QueryRow(ctx, `SELECT r.device_id::text,r.source_id::text,d.protocol_device_id,d.owner_user_id::text,s.device_id::text,s.transport,s.revoked_at IS NULL
 FROM local_receivers r JOIN devices d ON d.id=r.device_id JOIN ingestion_sources s ON s.id=r.source_id WHERE r.id=$1`, bindingID).Scan(&b.DeviceID, &b.SourceID, &b.ProtocolDeviceID, &owner, &sourceDevice, &transport, &active)
	if err == nil {
		if expected != nil && (b.DeviceID != expected.DeviceID || b.SourceID != expected.SourceID) {
			return Binding{}, errors.New("receiver identity differs from saved installation; inspect backup/restore")
		}
		if owner != p.UserID || sourceDevice != b.DeviceID || transport != "serial" || !active || b.ProtocolDeviceID != "CS01" {
			return Binding{}, errors.New("receiver binding changed or revoked; inspect the installation before retrying")
		}
	} else if errors.Is(err, pgx.ErrNoRows) {
		if expected != nil {
			return Binding{}, errors.New("saved receiver is absent; restore the matching database instead of reprovisioning")
		}
		b.ProtocolDeviceID = "CS01"
		err = tx.QueryRow(ctx, "INSERT INTO devices(owner_user_id,protocol_device_id,name) VALUES($1,'CS01','ESP32-C3 · datos sintéticos') RETURNING id::text", p.UserID).Scan(&b.DeviceID)
		if err != nil {
			return Binding{}, errors.New("receiver device creation failed")
		}
		secret := make([]byte, 32)
		if _, err = rand.Read(secret); err != nil {
			return Binding{}, errors.New("receiver credential generation failed")
		}
		hash := sha256.Sum256(secret)
		err = tx.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,external_gateway_id,credential_hash) VALUES($1,'serial','ESP32C3-SYNTHETIC',$2) RETURNING id::text", b.DeviceID, hex.EncodeToString(hash[:])).Scan(&b.SourceID)
		if err != nil {
			return Binding{}, errors.New("receiver source creation failed")
		}
		if _, err = tx.Exec(ctx, "INSERT INTO local_receivers(id,device_id,source_id) VALUES($1,$2,$3)", bindingID, b.DeviceID, b.SourceID); err != nil {
			return Binding{}, errors.New("receiver binding creation failed")
		}
	} else {
		return Binding{}, errors.New("receiver binding lookup failed")
	}
	if err = tx.Commit(ctx); err != nil {
		return Binding{}, errors.New("receiver binding commit failed")
	}
	return b, nil
}
