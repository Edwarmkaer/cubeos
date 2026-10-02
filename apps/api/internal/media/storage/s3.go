package storage

import (
	"context"
	"errors"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"io"
	"net/url"
	"os"
)

type S3Config struct{ Endpoint, Region, Bucket, AccessKey, SecretKey, TempRoot string }
type S3 struct {
	client   *minio.Client
	bucket   string
	tempRoot string
}

// Recovery requires ListBucket on this private bucket in addition to object
// permissions. The API does not enumerate the bucket or change its ACL.
func (s *S3) Keys(ctx context.Context) ([]string, error) {
	var keys []string
	for object := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Recursive: true}) {
		if object.Err != nil {
			return nil, object.Err
		}
		if validKey(object.Key) != nil {
			return nil, errors.New("foreign recovery object")
		}
		keys = append(keys, object.Key)
		if len(keys) > 100000 {
			return nil, errors.New("recovery inventory limit")
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return keys, nil
}

func NewS3(c S3Config) (*S3, error) {
	u, err := url.Parse(c.Endpoint)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || c.Bucket == "" || c.Region == "" || c.AccessKey == "" || c.SecretKey == "" {
		return nil, errors.New("incomplete S3 configuration")
	}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""), Secure: u.Scheme == "https", Region: c.Region})
	if err != nil {
		return nil, errors.New("invalid S3 configuration")
	}
	return &S3{client, c.Bucket, c.TempRoot}, nil
}
func (s *S3) Put(ctx context.Context, key string, r io.Reader, contentType string) error {
	if err := validKey(key); err != nil {
		return err
	}
	f, n, err := stage(ctx, r, s.tempRoot)
	if err != nil {
		return err
	}
	defer func() { f.Close(); os.Remove(f.Name()) }()
	_, err = s.client.PutObject(ctx, s.bucket, key, f, n, minio.PutObjectOptions{ContentType: contentType, DisableMultipart: true})
	return err
}
func (s *S3) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := validKey(key); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	if _, err = obj.Stat(); err != nil {
		obj.Close()
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return obj, nil
}
func (s *S3) Delete(ctx context.Context, key string) error {
	if err := validKey(key); err != nil {
		return err
	}
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}
