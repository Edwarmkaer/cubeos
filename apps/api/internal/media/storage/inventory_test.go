package storage

import (
	"bytes"
	"context"
	"os"
	"testing"
)

func TestLocalInventoryRefusesForeignFilesAndLinks(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	s, e := NewLocal(root)
	if e != nil {
		t.Fatal(e)
	}
	key := "photos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original"
	if e = s.Put(ctx, key, bytes.NewReader([]byte("original")), "image/png"); e != nil {
		t.Fatal(e)
	}
	keys, e := s.Keys(ctx)
	if e != nil || len(keys) != 1 || keys[0] != key {
		t.Fatal(keys, e)
	}
	os.WriteFile(root+"/foreign", []byte("user data"), 0600)
	if _, e = s.Keys(ctx); e == nil {
		t.Fatal("foreign data was omitted")
	}
	os.Remove(root + "/foreign")
	os.Symlink("original", root+"/photos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/thumbnail")
	if _, e = s.Keys(ctx); e == nil {
		t.Fatal("symlink inventory accepted")
	}
}
