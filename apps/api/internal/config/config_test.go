package config

import "testing"

func TestLocalDefaultsAndInvalidConfigurations(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "postgres://test@localhost/db"}
	load := func(m map[string]string) (Config, error) { return Load(func(k string) string { return m[k] }) }
	c, err := load(base)
	if err != nil || c.Address != "127.0.0.1:8080" {
		t.Fatalf("defaults: %+v %v", c, err)
	}
	for _, extra := range []map[string]string{
		{"DEPLOYMENT_MODE": "public"}, {"AUTH_MODE": "clerk"}, {"LISTEN_HOST": "0.0.0.0"},
		{"ALLOWED_ORIGIN": "https://evil.example"}, {"PORT": "invalid"}, {"DEPLOYMENT_MODE": "typo"},
		{"LOCAL_CONTAINER": "true", "DEPLOYMENT_MODE": "public"}, {"LOCAL_CONTAINER": "true", "LISTEN_HOST": "192.168.1.2"},
	} {
		m := map[string]string{"DATABASE_URL": base["DATABASE_URL"]}
		for k, v := range extra {
			m[k] = v
		}
		if _, err := load(m); err == nil {
			t.Errorf("accepted unsafe config: %v", extra)
		}
	}
	if _, err := load(map[string]string{}); err == nil {
		t.Fatal("missing database accepted")
	}
	c, err = load(map[string]string{"DATABASE_URL": base["DATABASE_URL"], "LOCAL_CONTAINER": "true", "LISTEN_HOST": "0.0.0.0"})
	if err != nil || c.Address != "0.0.0.0:8080" {
		t.Fatalf("container: %v", err)
	}
}
