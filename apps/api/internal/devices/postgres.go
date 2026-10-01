package devices

import (
	"context"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
)

type Device struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	ProtocolDeviceID string `json:"protocolDeviceId"`
}
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(p *pgxpool.Pool) *Repository { return &Repository{p} }
func scan(row pgx.Row) (Device, error) {
	var d Device
	err := row.Scan(&d.ID, &d.Name, &d.ProtocolDeviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return d, err
}
func (r *Repository) Get(ctx context.Context, p identity.Principal, id string) (Device, error) {
	return scan(r.pool.QueryRow(ctx, "SELECT id::text,name,protocol_device_id FROM devices WHERE id=$1 AND owner_user_id=$2", id, p.UserID))
}
func (r *Repository) List(ctx context.Context, p identity.Principal) ([]Device, error) {
	rows, err := r.pool.Query(ctx, "SELECT id::text,name,protocol_device_id FROM devices WHERE owner_user_id=$1 ORDER BY created_at,id", p.UserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Device{}
	for rows.Next() {
		d, err := scan(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
func (r *Repository) Create(ctx context.Context, p identity.Principal, i Input) (Device, error) {
	if err := i.Validate(); err != nil {
		return Device{}, err
	}
	return scan(r.pool.QueryRow(ctx, "INSERT INTO devices(owner_user_id,name,protocol_device_id) VALUES($1,$2,$3) RETURNING id::text,name,protocol_device_id", p.UserID, strings.TrimSpace(i.Name), i.ProtocolDeviceID))
}
func (r *Repository) Rename(ctx context.Context, p identity.Principal, id, name string) (Device, error) {
	if !ValidName(name) {
		return Device{}, ErrInvalid
	}
	return scan(r.pool.QueryRow(ctx, "UPDATE devices SET name=$1 WHERE id=$2 AND owner_user_id=$3 RETURNING id::text,name,protocol_device_id", strings.TrimSpace(name), id, p.UserID))
}
func (r *Repository) Delete(ctx context.Context, p identity.Principal, id string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM devices WHERE id=$1 AND owner_user_id=$2", id, p.UserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
