package identity

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Principal struct{ UserID string }

func Local(ctx context.Context, p *pgxpool.Pool) (Principal, error) {
	tx, err := p.Begin(ctx)
	if err != nil {
		return Principal{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026100104)"); err != nil {
		return Principal{}, err
	}
	var result Principal
	err = tx.QueryRow(ctx, "SELECT user_id::text FROM auth_identities WHERE provider='local' AND subject='installation'").Scan(&result.UserID)
	if err == pgx.ErrNoRows {
		if err = tx.QueryRow(ctx, "INSERT INTO users(display_name) VALUES('Perfil local') RETURNING id::text").Scan(&result.UserID); err != nil {
			return Principal{}, err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO auth_identities(user_id,provider,subject) VALUES($1,'local','installation')", result.UserID); err != nil {
			return Principal{}, err
		}
	} else if err != nil {
		return Principal{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Principal{}, err
	}
	return result, nil
}
