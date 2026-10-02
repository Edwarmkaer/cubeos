package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path"
)

type Local struct{ directory string }

func NewLocal(directory string) (*Local, error) {
	if directory == "" {
		return nil, errors.New("local root required")
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	return &Local{directory}, nil
}
func (s *Local) Put(ctx context.Context, key string, r io.Reader, _ string) error {
	if err := validKey(key); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	root, err := os.OpenRoot(s.directory)
	if err != nil {
		return err
	}
	defer root.Close()
	if err = root.MkdirAll(path.Dir(key), 0700); err != nil {
		return err
	}
	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		return err
	}
	temp := path.Dir(key) + "/.upload-" + hex.EncodeToString(random)
	f, err := root.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer root.Remove(temp)
	n, copyErr := io.Copy(f, io.LimitReader(contextReader{ctx, r}, MaxObjectBytes+1))
	if copyErr == nil && n > MaxObjectBytes {
		copyErr = errors.New("object size limit")
	}
	if copyErr == nil {
		copyErr = f.Sync()
	}
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	if err = root.Rename(temp, key); err != nil {
		return err
	}
	d, err := root.Open(path.Dir(key))
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
func (s *Local) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := validKey(key); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(s.directory)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	f, err := root.Open(key)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return f, err
}
func (s *Local) Delete(ctx context.Context, key string) error {
	if err := validKey(key); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	root, err := os.OpenRoot(s.directory)
	if err != nil {
		return err
	}
	defer root.Close()
	err = root.Remove(key)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
