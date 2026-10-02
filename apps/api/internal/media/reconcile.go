package media

import (
	"context"
	"errors"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	"github.com/google/uuid"
	"io"
	"os"
	"strings"
	"time"
)

// Explicit operator command. It only considers metadata for this backend and
// known staging names; it never enumerates or purges the object bucket.
func (s *Service) Reconcile(ctx context.Context, minAge time.Duration) error {
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return ErrLimit
	}
	rows, err := s.pool.Query(ctx, "SELECT id::text FROM photos WHERE storage_backend=$1 AND imported_at<clock_timestamp()-$2::interval ORDER BY COALESCE(reconciled_at,imported_at),id LIMIT 100", s.cfg.MediaStorage, minAge.String())
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, id := range ids {
		if err = s.reconcileOne(ctx, id); err != nil {
			return err
		}
	}
	return s.cleanupStaging(ctx)
}
func (s *Service) reconcileOne(ctx context.Context, id string) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	var locked bool
	if err = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,20261010))", id).Scan(&locked); err != nil {
		return err
	}
	if !locked {
		return nil
	}
	defer unlock(conn, id)
	// Rotate attempted rows so interrupted uploads cannot starve recoverable photos.
	if _, err = conn.Exec(ctx, "UPDATE photos SET reconciled_at=clock_timestamp() WHERE id=$1", id); err != nil {
		return err
	}
	p, err := scanPhoto(conn.QueryRow(ctx, "SELECT "+columns+" FROM photos p WHERE id=$1 AND storage_backend=$2", id, s.cfg.MediaStorage))
	if err != nil {
		return err
	}
	if local, ok := s.store.(*objects.Local); ok {
		if err = local.CleanupTemporary(ctx, p.OriginalKey); err != nil {
			return err
		}
	}
	if err = s.verify(ctx, p); err != nil {
		if errors.Is(err, objects.ErrNotFound) || errors.Is(err, ErrInvalid) {
			_, err = conn.Exec(ctx, "UPDATE photos SET status='pending' WHERE id=$1", id)
			return err
		}
		return err
	}
	if _, err = conn.Exec(ctx, "UPDATE photos SET status='ready' WHERE id=$1", id); err != nil {
		return err
	}
	p.Status = "ready"
	if p.HasThumbnail {
		derivative, e := s.store.Open(ctx, p.ThumbnailKey)
		if e == nil {
			derivative.Close()
			return nil
		}
		if !errors.Is(e, objects.ErrNotFound) {
			return e
		}
		if _, err = conn.Exec(ctx, "UPDATE photos SET thumbnail_key=NULL WHERE id=$1 AND thumbnail_key=$2", id, p.ThumbnailKey); err != nil {
			return err
		}
		p.HasThumbnail = false
		p.ThumbnailKey = ""
	}
	source, err := s.store.Open(ctx, p.OriginalKey)
	if err != nil {
		return err
	}
	defer source.Close()
	if err = os.MkdirAll(s.cfg.MediaTempRoot, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(s.cfg.MediaTempRoot+"/stage-"+uuid.NewString(), os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer func() { f.Close(); os.Remove(f.Name()) }()
	n, err := io.Copy(f, io.LimitReader(cancelReader{ctx, source}, p.Size+1))
	if err != nil {
		return err
	}
	if n != p.Size {
		return ErrInvalid
	}
	s.makeThumbnail(ctx, conn, &p, f)
	return nil
}
func (s *Service) cleanupStaging(ctx context.Context) error {
	root, err := os.OpenRoot(s.cfg.MediaTempRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer root.Close()
	d, err := root.Open(".")
	if err != nil {
		return err
	}
	entries, err := d.ReadDir(-1)
	d.Close()
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, "stage-") || uuid.Validate(strings.TrimPrefix(name, "stage-")) != nil {
			continue
		}
		stat, err := entry.Info()
		if err != nil {
			return err
		}
		if !stat.Mode().IsRegular() || time.Since(stat.ModTime()) < 24*time.Hour {
			continue
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		if err = root.Remove(name); err != nil {
			return err
		}
	}
	return nil
}
