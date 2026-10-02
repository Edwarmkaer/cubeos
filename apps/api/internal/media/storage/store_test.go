package storage

import (
	"bytes"
	"context"
	"errors"
	"github.com/minio/minio-go/v7"
	"io"
	"net/http"
	"os"
	"testing"
)

type brokenReader struct{}

func (brokenReader) Read([]byte) (int, error) { return 0, errors.New("interrupted") }

// Catches partial writes becoming visible, key traversal, lost bytes, and public S3 access.
func contract(t *testing.T, s ObjectStore) {
	t.Helper()
	ctx := context.Background()
	key := "photos/11111111-1111-4111-8111-111111111111/original"
	payload := []byte{0, 255, 13, 10, 0, 42}
	if err := s.Put(ctx, key, bytes.NewReader(payload), "image/png"); err != nil {
		t.Fatal(err)
	}
	r, err := s.Open(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(r)
	r.Close()
	if err != nil || !bytes.Equal(got, payload) {
		t.Fatalf("exact bytes %v %v", got, err)
	}
	if err = s.Put(ctx, key, brokenReader{}, "image/png"); err == nil {
		t.Fatal("interruption accepted")
	}
	r, err = s.Open(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	got, _ = io.ReadAll(r)
	r.Close()
	if !bytes.Equal(got, payload) {
		t.Fatal("failed replacement destroyed original")
	}
	for _, bad := range []string{"../escape", "/absolute", "photos/../../escape", "photos\\escape", ""} {
		if s.Put(ctx, bad, bytes.NewReader(payload), "image/png") == nil {
			t.Fatal("unsafe key", bad)
		}
	}
	if err = s.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Open(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatal("missing", err)
	}
	if err = s.Delete(ctx, key); err != nil {
		t.Fatal("idempotent delete", err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if s.Put(canceled, key, bytes.NewReader(payload), "image/png") == nil {
		t.Fatal("cancellation ignored")
	}
}
func TestLocalContract(t *testing.T) {
	s, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	contract(t, s)
}
func TestS3Contract(t *testing.T) {
	endpoint := os.Getenv("TEST_S3_ENDPOINT")
	if endpoint == "" {
		if os.Getenv("TEST_MEDIA_REQUIRED") == "1" {
			t.Fatal("real S3 required")
		}
		t.Skip("real isolated S3 required")
	}
	s, err := NewS3(S3Config{Endpoint: endpoint, Region: "us-east-1", Bucket: os.Getenv("TEST_S3_BUCKET"), AccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("TEST_S3_SECRET_KEY")})
	if err != nil {
		t.Fatal(err)
	}
	exists, err := s.client.BucketExists(context.Background(), s.bucket)
	if err != nil {
		t.Fatal(err)
	}
	if !exists {
		if err = s.client.MakeBucket(context.Background(), s.bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	contract(t, s)
	key := "photos/22222222-2222-4222-8222-222222222222/original"
	if err = s.Put(context.Background(), key, bytes.NewReader([]byte("private")), "image/png"); err != nil {
		t.Fatal(err)
	}
	response, err := http.Get(endpoint + "/" + s.bucket + "/" + key)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("anonymous object access", response.StatusCode)
	}
}
