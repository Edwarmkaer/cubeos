package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/recovery"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, "recovery failed; check private configuration, quiescence, archive and empty disposable target")
		os.Exit(1)
	}
	fmt.Println("recovery complete; keep archive private and verify installation before enabling writers")
}
func run() error {
	// Separate environment avoids an accidental default DATABASE_URL or MEDIA_*
	// from a running production process becoming a restore destination.
	if len(os.Args) != 4 || (os.Args[1] != "backup" && os.Args[1] != "restore") {
		return errors.New("usage")
	}
	restore := os.Args[1] == "restore"
	if (!restore && os.Args[3] != "--writers-stopped") || (restore && os.Args[3] != "--new-disposable-target") {
		return errors.New("explicit acknowledgement required")
	}
	backend := os.Getenv("RECOVERY_STORAGE")
	var store recovery.Inventory
	var e error
	target := os.Getenv("RECOVERY_LOCAL_ROOT")
	if backend == "s3" {
		target = os.Getenv("RECOVERY_S3_BUCKET")
	}
	if restore && recovery.ValidateTarget(os.Getenv("RECOVERY_DATABASE_URL"), backend, target) != nil {
		return errors.New("invalid disposable target")
	}
	if backend == "local" {
		store, e = storage.NewLocal(target)
	} else if backend == "s3" {
		target = os.Getenv("RECOVERY_S3_BUCKET")
		endpoint := os.Getenv("RECOVERY_S3_ENDPOINT")
		// Same secure endpoint boundary as application configuration; test plaintext
		// is only allowed on loopback, never a public/private-network cloud endpoint.
		if !secureEndpoint(endpoint) {
			return errors.New("secure endpoint required")
		}
		store, e = storage.NewS3(storage.S3Config{Endpoint: endpoint, Region: os.Getenv("RECOVERY_S3_REGION"), Bucket: target, AccessKey: os.Getenv("RECOVERY_S3_ACCESS_KEY"), SecretKey: os.Getenv("RECOVERY_S3_SECRET_KEY"), TempRoot: os.Getenv("RECOVERY_TEMP_ROOT")})
	} else {
		return errors.New("explicit storage required")
	}
	if e != nil {
		return errors.New("storage config")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
	defer cancel()
	if restore {
		return recovery.Restore(ctx, os.Getenv("RECOVERY_DATABASE_URL"), store, backend, target, os.Args[2], true)
	}
	return recovery.Backup(ctx, os.Getenv("RECOVERY_DATABASE_URL"), store, backend, os.Args[2], true)
}
