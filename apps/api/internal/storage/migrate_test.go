package storage

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"sync"
	"testing"
	"testing/fstest"
)

func TestConcurrentMigrationAndTransactionalRollback(t *testing.T) {
	url := os.Getenv("TEST_MIGRATION_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_MIGRATION_DATABASE_URL required")
	}
	ctx := context.Background()
	p, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if _, err = p.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	broken := fstest.MapFS{"001.sql": {Data: []byte("CREATE TABLE rollback_probe(id int); SELECT missing_function();")}}
	if err = migrate(ctx, p, broken); err == nil {
		t.Fatal("invalid migration passed")
	}
	var exists bool
	if err = p.QueryRow(ctx, "SELECT to_regclass('rollback_probe') IS NOT NULL").Scan(&exists); err != nil || exists {
		t.Fatalf("partial migration persisted %v", err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for range 4 {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- Migrate(ctx, p) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = Ready(ctx, p); err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(ctx, "INSERT INTO schema_migrations(version,checksum) VALUES('999_future.sql','future')"); err != nil {
		t.Fatal(err)
	}
	if err = Ready(ctx, p); err == nil {
		t.Fatal("future schema ready")
	}
	if err = Migrate(ctx, p); err == nil {
		t.Fatal("future schema accepted by old migrator")
	}
	if _, err = p.Exec(ctx, "DELETE FROM schema_migrations WHERE version='999_future.sql'"); err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(ctx, "UPDATE schema_migrations SET checksum='tampered'"); err != nil {
		t.Fatal(err)
	}
	if err = Ready(ctx, p); err == nil {
		t.Fatal("checksum drift ready")
	}
	if err = Migrate(ctx, p); err == nil {
		t.Fatal("checksum drift applied")
	}
}
