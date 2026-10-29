package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/cloudrelay"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/receiver"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
)

const relayDirectory = "/data/cloud-relay"

func prepareRelay(ctx context.Context, pool *pgxpool.Pool, input io.Reader, device, mode, directory string) error {
	if mode != "local" || !receiver.ValidID(device) {
		return errors.New("relay preparation requires local device")
	}
	operation, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	principal, err := identity.Local(operation, pool)
	if err != nil {
		return errors.New("local identity unavailable")
	}
	if _, err = devices.NewRepository(pool).Get(operation, principal, device); err != nil {
		return errors.New("local device unavailable")
	}
	return cloudrelay.Prepare(input, directory, device)
}

type relayReader struct {
	repo      *telemetry.Repository
	principal identity.Principal
	device    string
}

func (r relayReader) Latest(ctx context.Context) (cloudrelay.Replica, error) {
	operation, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	p, err := r.repo.GetSnapshot(operation, r.principal, r.device)
	if err != nil {
		return cloudrelay.Replica{}, err
	}
	snapshot, err := json.Marshal(p.Snapshot)
	if err != nil {
		return cloudrelay.Replica{}, err
	}
	return cloudrelay.Replica{RevisionID: strconv.FormatInt(p.Revision, 10), Snapshot: snapshot, FreshnessByGroup: p.FreshnessByGroup}, nil
}
func startCloudRelay(ctx context.Context, pool *pgxpool.Pool) {
	c, err := cloudrelay.ReadConfig(filepath.Join(relayDirectory, "config.json"))
	if err != nil {
		log.Print("Cloud relay disabled: invalid or expired private configuration; local telemetry remains active")
		return
	}
	operation, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	principal, err := identity.Local(operation, pool)
	if err != nil {
		log.Print("Cloud relay disabled: local identity unavailable")
		return
	}
	if _, err = devices.NewRepository(pool).Get(operation, principal, c.DeviceID); err != nil {
		log.Print("Cloud relay disabled: local device unavailable")
		return
	}
	go func() {
		options := c.Options()
		options.Enabled = func() bool { _, err := os.Stat(filepath.Join(relayDirectory, "config.json")); return err == nil }
		err := cloudrelay.Run(ctx, relayReader{telemetry.NewRepository(pool), principal, c.DeviceID}, c.Publisher(), options)
		if ctx.Err() == nil && err != nil {
			log.Print("Cloud relay stopped; check channel access or expiry. Local telemetry remains active.")
		}
	}()
}
func removeRelay() error {
	err := os.Remove(filepath.Join(relayDirectory, "config.json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
