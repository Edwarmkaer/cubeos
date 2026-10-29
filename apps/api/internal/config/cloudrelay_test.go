package config

import "testing"

func TestCloudRelayIsExplicitAndLocalOnly(t *testing.T) {
	env := map[string]string{"DATABASE_URL": "postgres://test@localhost/db"}
	load := func() (Config, error) { return Load(func(k string) string { return env[k] }) }
	c, e := load()
	if e != nil || c.CloudRelayEnabled {
		t.Fatal("cloud enabled implicitly")
	}
	env["CLOUD_RELAY_ENABLED"] = "true"
	c, e = load()
	if e != nil || !c.CloudRelayEnabled {
		t.Fatal("explicit cloud not enabled")
	}
	env["CLOUD_RELAY_ENABLED"] = "invalid"
	if _, e = load(); e == nil {
		t.Fatal("invalid flag accepted")
	}
}
