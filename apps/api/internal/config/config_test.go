package config

import "testing"

func TestTransportConfigurationRequiresExplicitPhysicalSettings(t *testing.T) {
	load := func(extra map[string]string) (Config, error) {
		extra["DATABASE_URL"] = "postgres://test@localhost/db"
		return Load(func(k string) string { return extra[k] })
	}
	for _, extra := range []map[string]string{{"SERIAL_PORT": "/dev/ttyUSB0"}, {"SERIAL_BAUD": "115200"}, {"SERIAL_SOURCE_ID": "bad"}, {"INGESTION_ADDRESS": "0.0.0.0:8081"}, {"INGESTION_ADDRESS": "8.8.8.8:8081"}, {"INGESTION_ADDRESS": "192.168.1.2:8080"}, {"INGESTION_ADDRESS": "localhost:8081"}, {"SERIAL_PORT": "/dev/ttyUSB0", "SERIAL_BAUD": "0", "SERIAL_SOURCE_ID": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}} {
		if _, err := load(extra); err == nil {
			t.Fatal("unsafe/incomplete transport config", extra)
		}
	}
	c, err := load(map[string]string{"SERIAL_PORT": "/dev/ttyUSB0", "SERIAL_BAUD": "57600", "SERIAL_SOURCE_ID": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "INGESTION_ADDRESS": "192.168.1.2:8081"})
	if err != nil || c.SerialBaud != 57600 || c.Address != "127.0.0.1:8080" || c.IngestionAddress != "192.168.1.2:8081" {
		t.Fatal(c, err)
	}
}

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
