package storage

import (
	"context"
	"errors"
	"os"
	"path"
	"regexp"
)

var uploadName = regexp.MustCompile(`^\.upload-[0-9a-f]{32}$`)

// Called only under the corresponding metadata advisory lock. Removes remnants
// of interrupted atomic writes in exactly one metadata-owned object directory.
func (s *Local) CleanupTemporary(ctx context.Context, key string) error {
	if err := validKey(key); err != nil {
		return err
	}
	root, err := os.OpenRoot(s.directory)
	if err != nil {
		return err
	}
	defer root.Close()
	d, err := root.Open(path.Dir(key))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	entries, err := d.ReadDir(-1)
	d.Close()
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !uploadName.MatchString(entry.Name()) {
			continue
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		if err = root.Remove(path.Dir(key) + "/" + entry.Name()); err != nil {
			return err
		}
	}
	return nil
}
