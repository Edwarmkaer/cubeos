package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"time"
)

// fixture is an explicit trusted local command with database access. It creates
// a dedicated device/source; there is no unauthenticated network ingestion.
func fixture(ctx context.Context, pool *pgxpool.Pool, input io.Reader, output io.Writer) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := storage.Ready(ctx, pool); err != nil {
		return errors.New("migrations required")
	}
	raw, err := io.ReadAll(io.LimitReader(input, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 {
		return errors.New("fixture input exceeds 1 MiB")
	}
	var packets []json.RawMessage
	if err = json.Unmarshal(raw, &packets); err != nil || len(packets) == 0 || len(packets) > 200 {
		return errors.New("fixture requires an array of 1..200 uplinks")
	}
	// Validate the complete fixture before creating anything. Test-only rejected
	// receptions use Ingest directly, not this convenience command.
	protocol := ""
	for _, raw := range packets {
		p, e := ingestion.Validate(raw)
		if e != nil {
			return errors.New("invalid fixture uplink")
		}
		id := p["id"].(string)
		if protocol == "" {
			protocol = id
		}
		if id != protocol {
			return errors.New("fixture requires one protocol device id")
		}
	}
	principal, err := identity.Local(ctx, pool)
	if err != nil {
		return errors.New("local profile unavailable")
	}
	// Creation is atomic. The command never revokes/modifies an existing source.
	tx, err := pool.Begin(ctx)
	if err != nil {
		return errors.New("fixture storage unavailable")
	}
	defer tx.Rollback(context.Background())
	var device devices.Device
	device.ProtocolDeviceID = protocol
	err = tx.QueryRow(ctx, "INSERT INTO devices(owner_user_id,protocol_device_id,name) VALUES($1,$2,'Fixture Chasqui v2') RETURNING id::text", principal.UserID, protocol).Scan(&device.ID)
	if err != nil {
		return errors.New("fixture device unavailable")
	}
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		return err
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(secret))
	var source string
	err = tx.QueryRow(ctx, "INSERT INTO ingestion_sources(device_id,transport,credential_hash) VALUES($1,'http',$2) RETURNING id::text", device.ID, hash).Scan(&source)
	if err != nil {
		return errors.New("fixture source unavailable")
	}
	if err = tx.Commit(ctx); err != nil {
		return errors.New("fixture creation failed")
	}
	service := ingestion.NewService(ingestion.NewRepository(pool))
	results := []ingestion.IngestResult{}
	for _, raw := range packets {
		result, err := service.Ingest(ctx, source, raw, telemetry.ReceiverMetadata{})
		if err != nil {
			return errors.New("fixture reception failed; inspect its device before retrying")
		}
		results = append(results, result)
	}
	projection, err := telemetry.NewRepository(pool).GetSnapshot(ctx, principal, device.ID)
	if err != nil {
		return errors.New("fixture snapshot unavailable")
	}
	return json.NewEncoder(output).Encode(struct {
		DeviceID   string                   `json:"deviceId"`
		SourceID   string                   `json:"sourceId"`
		Results    []ingestion.IngestResult `json:"results"`
		Projection telemetry.Projection     `json:"projection"`
	}{device.ID, source, results, projection})
}
