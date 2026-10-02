package ingestion

import (
	"context"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSerialPostgresOperationDeadlineAndRecovery(t *testing.T) {
	url := os.Getenv("TEST_INGESTION_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("database required")
		}
		t.Skip("database required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err = pool.Exec(ctx, "DROP SCHEMA public CASCADE;CREATE SCHEMA public"); err != nil {
		t.Fatal(err)
	}
	if err = storage.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	principal, err := identity.Local(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	device, err := devices.NewRepository(pool).Create(ctx, principal, devices.Input{Name: "serial deadlines", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	sources := NewSources(pool)
	source, err := sources.Create(ctx, principal, device.ID, SourceInput{Transport: "serial"})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewRepository(pool))
	for _, frame := range []string{envelopeH, "{bad}", strings.Repeat("x", MaxEnvelopeBytes+1)} {
		lock, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = lock.Exec(ctx, "SELECT id FROM devices WHERE id=$1 FOR UPDATE", device.ID); err != nil {
			t.Fatal(err)
		}
		worker, cancel := context.WithCancel(ctx)
		done := make(chan error, 1)
		go func() { done <- ReadSerial(worker, strings.NewReader(frame+"\n"), service, source.ID) }()
		select {
		case err = <-done:
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Errorf("expected per-frame deadline: %v", err)
			}
		case <-time.After(5500 * time.Millisecond):
			cancel()
			<-done
			t.Error("serial still blocked beyond operation deadline")
		}
		cancel()
		if err = lock.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets").Scan(&count); err != nil || count != 0 {
		t.Fatal("failed receptions persisted", count, err)
	}
	// Source lookup has its own bounded operation even with a live worker context.
	lock, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = lock.Exec(ctx, "LOCK TABLE ingestion_sources IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	lookup, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { _, e := sources.ActiveSerial(lookup, principal, source.ID); done <- e }()
	select {
	case err = <-done:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("lookup deadline: %v", err)
		}
	case <-time.After(5500 * time.Millisecond):
		cancel()
		<-done
		t.Error("lookup remains blocked")
	}
	cancel()
	if err = lock.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	// Worker lifetime stays open after a blocked operation; reconnect then ingest.
	lock, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Rollback(context.Background())
	if _, err = lock.Exec(ctx, "SELECT id FROM devices WHERE id=$1 FOR UPDATE", device.ID); err != nil {
		t.Fatal(err)
	}
	worker, cancel := context.WithCancel(ctx)
	defer cancel()
	pr, pw := io.Pipe()
	attempts := 0
	reconnected := make(chan struct{})
	done = make(chan error, 1)
	go func() {
		done <- RunSerial(worker, func() (io.ReadCloser, error) {
			attempts++
			if attempts == 1 {
				return io.NopCloser(strings.NewReader(envelopeH + "\n")), nil
			}
			if attempts == 2 {
				close(reconnected)
			}
			return pr, nil
		}, service, source.ID, 20*time.Millisecond)
	}()
	select {
	case <-reconnected:
	case <-time.After(5500 * time.Millisecond):
		cancel()
		pw.Close()
		<-done
		t.Fatal("same worker failed to reconnect after operation deadline")
	}
	if err = lock.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = pw.Write([]byte(envelopeH + "\n")); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if err = pool.QueryRow(ctx, "SELECT count(*) FROM received_packets WHERE status='accepted'").Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if count != 1 {
		t.Fatal("serial did not recover")
	}
	cancel()
	pw.Close()
	<-done
	if err = sources.Revoke(ctx, principal, device.ID, source.ID); err != nil {
		t.Fatal(err)
	}
	if err = ReadSerial(ctx, strings.NewReader(envelopeH+"\n"), service, source.ID); !errors.Is(err, io.EOF) {
		t.Fatal(err)
	}
	var cause string
	if err = pool.QueryRow(ctx, "SELECT cause FROM received_packets ORDER BY id DESC LIMIT 1").Scan(&cause); err != nil || cause != "source_revoked" {
		t.Fatal(cause, err)
	}
}
