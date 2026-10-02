package construction

import (
	"context"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"time"
)

type Step struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Instructions string `json:"instructions"`
	DisplayOrder int    `json:"displayOrder"`
}
type StepState struct {
	Step
	Completed   bool       `json:"completed"`
	CompletedAt *time.Time `json:"completedAt"`
}
type Progress struct {
	DeviceID   string      `json:"deviceId"`
	Total      int         `json:"total"`
	Completed  int         `json:"completed"`
	Percentage float64     `json:"percentage"`
	Steps      []StepState `json:"steps"`
}
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(p *pgxpool.Pool) *Repository { return &Repository{p} }
func (r *Repository) List(ctx context.Context) ([]Step, error) {
	rows, err := r.pool.Query(ctx, "SELECT id::text,title,instructions,display_order FROM steps ORDER BY display_order,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Step{}
	for rows.Next() {
		var s Step
		if err = rows.Scan(&s.ID, &s.Title, &s.Instructions, &s.DisplayOrder); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
func owned(ctx context.Context, tx pgx.Tx, p identity.Principal, id string) error {
	var found string
	err := tx.QueryRow(ctx, "SELECT id::text FROM devices WHERE id=$1 AND owner_user_id=$2 FOR UPDATE", id, p.UserID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return devices.ErrNotFound
	}
	return err
}
func read(ctx context.Context, tx pgx.Tx, id string) (Progress, error) {
	result := Progress{DeviceID: id, Steps: []StepState{}}
	rows, err := tx.Query(ctx, `SELECT s.id::text,s.title,s.instructions,s.display_order,p.completed_at
 FROM steps s LEFT JOIN step_progress p ON p.step_id=s.id AND p.device_id=$1 ORDER BY s.display_order,s.id`, id)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var s StepState
		if err = rows.Scan(&s.ID, &s.Title, &s.Instructions, &s.DisplayOrder, &s.CompletedAt); err != nil {
			return result, err
		}
		s.Completed = s.CompletedAt != nil
		if s.Completed {
			result.Completed++
		}
		result.Steps = append(result.Steps, s)
	}
	result.Total = len(result.Steps)
	if result.Total > 0 {
		result.Percentage = 100 * float64(result.Completed) / float64(result.Total)
	}
	return result, rows.Err()
}
func (r *Repository) Get(ctx context.Context, p identity.Principal, id string) (Progress, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Progress{}, err
	}
	defer tx.Rollback(ctx)
	if err = owned(ctx, tx, p, id); err != nil {
		return Progress{}, err
	}
	result, err := read(ctx, tx, id)
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}
func (r *Repository) Set(ctx context.Context, p identity.Principal, id, stepID string, completed bool) (Progress, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Progress{}, err
	}
	defer tx.Rollback(ctx)
	if err = owned(ctx, tx, p, id); err != nil {
		return Progress{}, err
	}
	var found string
	err = tx.QueryRow(ctx, "SELECT id::text FROM steps WHERE id=$1 FOR SHARE", stepID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return Progress{}, devices.ErrNotFound
	}
	if err != nil {
		return Progress{}, err
	}
	if completed {
		_, err = tx.Exec(ctx, "INSERT INTO step_progress(device_id,step_id) VALUES($1,$2) ON CONFLICT(device_id,step_id) DO NOTHING", id, stepID)
	} else {
		_, err = tx.Exec(ctx, "DELETE FROM step_progress WHERE device_id=$1 AND step_id=$2", id, stepID)
	}
	if err != nil {
		return Progress{}, err
	}
	result, err := read(ctx, tx, id)
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}
