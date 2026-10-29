package cloudrelay

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func configJSON() string {
	return fmt.Sprintf(`{"schemaVersion":1,"channelId":"11111111-1111-4111-8111-111111111111","deviceId":"22222222-2222-4222-8222-222222222222","endpoint":"https://test-123.convex.site/telemetry/v1/snapshot","publishToken":"%s","expiresAt":%d}`, strings.Repeat("a", 64), time.Now().Add(time.Hour).UnixMilli())
}
func TestRelayConfigurationRequiresPrivateFileAndExactHTTPSDestination(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	if e := os.WriteFile(path, []byte(configJSON()), 0600); e != nil {
		t.Fatal(e)
	}
	c, e := ReadConfig(path)
	if e != nil || c.DeviceID != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("valid config: %v", e)
	}
	if e = os.Chmod(path, 0644); e != nil {
		t.Fatal(e)
	}
	if _, e = ReadConfig(path); e == nil {
		t.Fatal("accepted public token file")
	}
	_ = os.Chmod(path, 0600)
	link := filepath.Join(dir, "link")
	if e = os.Symlink(path, link); e != nil {
		t.Fatal(e)
	}
	if _, e = ReadConfig(link); e == nil {
		t.Fatal("accepted symlink")
	}
	for _, endpoint := range []string{"http://localhost:8080/telemetry/v1/snapshot", "https://test.convex.site.evil.com/telemetry/v1/snapshot", "https://user:pass@test.convex.site/telemetry/v1/snapshot", "https://test.convex.site/telemetry/v1/snapshot?q=1"} {
		raw := strings.Replace(configJSON(), "https://test-123.convex.site/telemetry/v1/snapshot", endpoint, 1)
		_ = os.WriteFile(path, []byte(raw), 0600)
		if _, e = ReadConfig(path); e == nil {
			t.Fatal("accepted untrusted destination")
		}
	}
}
func TestPrepareRelayRejectsWrongDeviceAndNeverOverwritesOnInvalidInput(t *testing.T) {
	dir := t.TempDir()
	device := "22222222-2222-4222-8222-222222222222"
	if e := Prepare(strings.NewReader(configJSON()), dir, device); e != nil {
		t.Fatal(e)
	}
	before, _ := os.ReadFile(filepath.Join(dir, "config.json"))
	if e := Prepare(strings.NewReader(configJSON()), dir, "11111111-1111-4111-8111-111111111111"); e == nil {
		t.Fatal("adopted wrong device")
	}
	if e := Prepare(strings.NewReader(`{"schemaVersion":1,"publishToken":"secret"}`), dir, device); e == nil {
		t.Fatal("accepted partial config")
	}
	after, _ := os.ReadFile(filepath.Join(dir, "config.json"))
	if string(after) != string(before) {
		t.Fatal("invalid input overwrote credential")
	}
	info, _ := os.Stat(filepath.Join(dir, "config.json"))
	if info.Mode().Perm() != 0600 {
		t.Fatal("credential file not private")
	}
}

func TestPrepareRejectsOversizeWhitespace(t *testing.T) {
	if err := Prepare(strings.NewReader(configJSON()+strings.Repeat(" ", 4097)), t.TempDir(), "22222222-2222-4222-8222-222222222222"); err == nil {
		t.Fatal("accepted oversized input")
	}
}
