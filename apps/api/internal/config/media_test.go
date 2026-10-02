package config

import "testing"

func TestMediaConfigFailsClosedAndBoundsResources(t *testing.T) {
	load := func(extra map[string]string) (Config, error) {
		extra["DATABASE_URL"] = "postgres://test@localhost/db"
		return Load(func(k string) string { return extra[k] })
	}
	for _, extra := range []map[string]string{{"MEDIA_STORAGE": "typo"}, {"MEDIA_STORAGE": "s3"}, {"MEDIA_MAX_BYTES": "0"}, {"MEDIA_MAX_PIXELS": "-1"}, {"MEDIA_MAX_BYTES": "268435457"}, {"MEDIA_MAX_PIXELS": "80000001"}} {
		if _, err := load(extra); err == nil {
			t.Fatal("unsafe media config", extra)
		}
	}
	c, err := load(map[string]string{})
	if err != nil || c.MediaMaxBytes != 64<<20 || c.MediaMaxPixels != 80_000_000 || c.MediaStorage != "local" {
		t.Fatal(c, err)
	}
}
