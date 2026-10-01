package storage

import (
	"context"
	"crypto/sha256"
	"embed"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io/fs"
	"strings"
)

//go:embed migrations/*.sql
var files embed.FS

func migrationFS() fs.FS                                 { f, _ := fs.Sub(files, "migrations"); return f }
func Migrate(ctx context.Context, p *pgxpool.Pool) error { return migrate(ctx, p, migrationFS()) }
func migrate(ctx context.Context, p *pgxpool.Pool, f fs.FS) error {
	tx, err := p.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026100103)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	entries, err := fs.ReadDir(f, ".")
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			known[entry.Name()] = true
		}
	}
	rows, err := tx.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return err
	}
	for rows.Next() {
		var version string
		if err = rows.Scan(&version); err != nil {
			rows.Close()
			return err
		}
		if !known[version] {
			rows.Close()
			return fmt.Errorf("unknown migration version: %s", version)
		}
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		raw, err := fs.ReadFile(f, entry.Name())
		if err != nil {
			return err
		}
		checksum := fmt.Sprintf("%x", sha256.Sum256(raw))
		var recorded string
		err = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE version=$1", entry.Name()).Scan(&recorded)
		if err == nil {
			if recorded != checksum {
				return fmt.Errorf("migration checksum mismatch: %s", entry.Name())
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return err
		}
		if _, err = tx.Exec(ctx, string(raw)); err != nil {
			return fmt.Errorf("migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", entry.Name(), checksum); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
func Ready(ctx context.Context, p *pgxpool.Pool) error {
	if err := p.Ping(ctx); err != nil {
		return err
	}
	rows, err := p.Query(ctx, "SELECT version,checksum FROM schema_migrations")
	if err != nil {
		return err
	}
	defer rows.Close()
	recorded := map[string]string{}
	for rows.Next() {
		var v, c string
		if err = rows.Scan(&v, &c); err != nil {
			return err
		}
		recorded[v] = c
	}
	if err = rows.Err(); err != nil {
		return err
	}
	f := migrationFS()
	entries, err := fs.ReadDir(f, ".")
	if err != nil {
		return err
	}
	if len(recorded) != len(entries) {
		return fmt.Errorf("migration versions differ")
	}
	for _, e := range entries {
		raw, err := fs.ReadFile(f, e.Name())
		if err != nil {
			return err
		}
		if recorded[e.Name()] != fmt.Sprintf("%x", sha256.Sum256(raw)) {
			return fmt.Errorf("migration missing or changed: %s", e.Name())
		}
	}
	return nil
}
