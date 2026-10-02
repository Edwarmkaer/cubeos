package ingestion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestHTTPAndSerialPostgresCredentialsIsolationAndParity(t *testing.T) {
	url := os.Getenv("TEST_INGESTION_DATABASE_URL")
	if url == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("database required")
		}
		t.Skip("database required")
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
	if err = storage.Migrate(ctx, p); err != nil {
		t.Fatal(err)
	}
	a, err := identity.Local(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	b := identity.Principal{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
	if _, err = p.Exec(ctx, "INSERT INTO users(id,display_name) VALUES($1,'B')", b.UserID); err != nil {
		t.Fatal(err)
	}
	dr := devices.NewRepository(p)
	da, err := dr.Create(ctx, a, devices.Input{Name: "A", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	db, err := dr.Create(ctx, b, devices.Input{Name: "B", ProtocolDeviceID: "CS01"})
	if err != nil {
		t.Fatal(err)
	}
	sources := NewSources(p)
	if _, err = sources.Create(ctx, a, db.ID, SourceInput{Transport: "http"}); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal("foreign source provision", err)
	}
	sa, err := sources.Create(ctx, a, da.ID, SourceInput{Transport: "http", GatewayID: "registered"})
	if err != nil {
		t.Fatal(err)
	}
	sb, err := sources.Create(ctx, b, db.ID, SourceInput{Transport: "serial", GatewayID: "registered"})
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err = p.QueryRow(ctx, "SELECT credential_hash FROM ingestion_sources WHERE id=$1", sa.ID).Scan(&stored); err != nil || stored == sa.Credential || len(stored) != 64 {
		t.Fatal("plaintext stored", err)
	}
	service := NewService(NewRepository(p))
	handler := NewHTTP(service, sources)
	send := func(token, body string, want int) IngestResult {
		t.Helper()
		req := httptest.NewRequest("POST", "http://localhost/api/v1/ingestion/packets", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("want %d got %d %s", want, w.Code, w.Body)
		}
		var result IngestResult
		json.Unmarshal(w.Body.Bytes(), &result)
		return result
	}
	send("invalid", envelopeH, 401)
	send(strings.Repeat("f", 64), envelopeH, 401)
	send(sb.Credential, envelopeH, 401)
	send(sa.Credential, strings.Repeat("x", MaxEnvelopeBytes+1), 413)
	if r := send(sa.Credential, envelopeH, 200); r.Status != "accepted" {
		t.Fatal(r)
	}
	if err = ReadSerial(ctx, bytes.NewBufferString(envelopeH+"\n"), service, sb.ID); !errors.Is(err, io.EOF) {
		t.Fatal(err)
	}
	tr := telemetry.NewRepository(p)
	snapA, err := tr.GetSnapshot(ctx, a, da.ID)
	if err != nil {
		t.Fatal(err)
	}
	snapB, err := tr.GetSnapshot(ctx, b, db.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapA.Snapshot["receivedAt"] == nil || snapB.Snapshot["receivedAt"] == nil {
		t.Fatal("server timestamps absent")
	}
	delete(snapA.Snapshot, "receivedAt")
	delete(snapB.Snapshot, "receivedAt")
	if !reflect.DeepEqual(snapA.Snapshot, snapB.Snapshot) {
		t.Fatal("transport snapshot mismatch")
	}
	pageA, e := tr.ListPackets(ctx, a, da.ID, telemetry.Filter{}, "", 100)
	if e != nil {
		t.Fatal(e)
	}
	pageB, e := tr.ListPackets(ctx, b, db.ID, telemetry.Filter{}, "", 100)
	if e != nil {
		t.Fatal(e)
	}
	if len(pageA.Packets) != 1 || len(pageB.Packets) != 1 || !bytes.Equal(pageA.Packets[0].Raw, pageB.Packets[0].Raw) || !reflect.DeepEqual(pageA.Packets[0].Normalized, pageB.Packets[0].Normalized) {
		t.Fatal("transport history mismatch")
	}
	if r := send(sa.Credential, envelopeH, 200); r.Status != "duplicated" {
		t.Fatal(r)
	}
	if r := send(sa.Credential, strings.Replace(envelopeH, `"rssiDbm":-80`, `"rssiDbm":80`, 1), 422); r.Cause != "invalid_receiver_metadata" {
		t.Fatal(r)
	}
	if r := send(sa.Credential, strings.Replace(envelopeH, `"dp":0`, `"dp":0,"rssiDbm":-80`, 1), 422); r.Cause != "invalid_uplink" {
		t.Fatal(r)
	}
	if _, err = tr.GetSnapshot(ctx, a, db.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal("foreign snapshot", err)
	}
	if r := send(sa.Credential, strings.Replace(envelopeH, "CS01", "CS02", 1), 422); r.Cause != "device_mismatch" {
		t.Fatal(r)
	}
	send(sa.Credential, strings.TrimSuffix(envelopeH, "}")+`,"sourceId":"forged"}`, 422)
	if err = sources.Revoke(ctx, b, da.ID, sa.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal("foreign revoke", err)
	}
	if err = sources.Revoke(ctx, a, da.ID, sa.ID); err != nil {
		t.Fatal(err)
	}
	send(sa.Credential, envelopeH, 401)
	if r, err := service.IngestEnvelope(ctx, sa.ID, []byte(envelopeH)); err != nil || r.Cause != "source_revoked" {
		t.Fatal("revocation at transaction", r, err)
	}
	// A registered serial source cannot be hijacked by local runtime on behalf of B.
	if _, err = sources.ActiveSerial(ctx, a, sb.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal("foreign serial", err)
	}
	var metadata []byte
	if err = sources.Revoke(ctx, b, db.ID, sb.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = sources.ActiveSerial(ctx, b, sb.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatal("revoked serial reopened", err)
	}
	if result, err := service.IngestEnvelope(ctx, sb.ID, []byte(envelopeH)); err != nil || result.Cause != "source_revoked" {
		t.Fatal(result, err)
	}
	for range 32 {
		if _, err = sources.Create(ctx, a, da.ID, SourceInput{Transport: "http"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = sources.Create(ctx, a, da.ID, SourceInput{Transport: "http"}); !errors.Is(err, devices.ErrInvalid) {
		t.Fatal("source quota unenforced", err)
	}
	if err = p.QueryRow(ctx, "SELECT receiver_metadata FROM received_packets WHERE source_id=$1 ORDER BY id LIMIT 1", sa.ID).Scan(&metadata); err != nil || !strings.Contains(string(metadata), `"gatewayId": "registered"`) || !strings.Contains(string(metadata), `"rssiDbm": -80`) {
		t.Fatal(string(metadata), err)
	}
}
