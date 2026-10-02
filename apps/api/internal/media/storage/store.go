package storage

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"io"
	"os"
	"regexp"
)

var ErrNotFound = errors.New("object not found")
var keyPattern = regexp.MustCompile(`^photos/[0-9a-f-]{36}/(original|thumbnail)$`)

const MaxObjectBytes int64 = 256 << 20

type ObjectStore interface {
	Put(context.Context, string, io.Reader, string) error
	Open(context.Context, string) (io.ReadCloser, error)
	Delete(context.Context, string) error
}

func validKey(key string) error {
	if !keyPattern.MatchString(key) {
		return errors.New("invalid object key")
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(b []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(b)
}

// Stage on disk before a single atomic PUT; reader errors never replace objects.
func stage(ctx context.Context, r io.Reader, directory string) (*os.File, int64, error) {
	if directory == "" {
		directory = os.TempDir()
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, 0, err
	}
	f, err := os.OpenFile(directory+"/stage-"+uuid.NewString(), os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return nil, 0, err
	}
	n, err := io.Copy(f, io.LimitReader(contextReader{ctx, r}, MaxObjectBytes+1))
	if err == nil && n > MaxObjectBytes {
		err = errors.New("object size limit")
	}
	if err == nil {
		_, err = f.Seek(0, 0)
	}
	if err != nil {
		name := f.Name()
		f.Close()
		os.Remove(name)
		return nil, 0, err
	}
	return f, n, nil
}
