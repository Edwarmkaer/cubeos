package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoveryCLIRefusesImplicitTargetWithoutLeakingSecrets(t *testing.T) {
	if os.Getenv("CUBEOS_RECOVERY_CLI_TEST") == "1" {
		for i, arg := range os.Args {
			if arg == "--" {
				os.Args = append([]string{"recovery"}, os.Args[i+1:]...)
				break
			}
		}
		main()
		return
	}
	for _, args := range [][]string{{"restore", "/archive", "--writers-stopped"}, {"restore", "/archive", "--new-disposable-target"}} {
		cmd := exec.Command(os.Args[0], append([]string{"-test.run=TestRecoveryCLIRefusesImplicitTargetWithoutLeakingSecrets", "--"}, args...)...)
		cmd.Env = append(os.Environ(), "CUBEOS_RECOVERY_CLI_TEST=1", "RECOVERY_DATABASE_URL=postgres://secret-user:secret-password@production.invalid/prod", "RECOVERY_STORAGE=s3", "RECOVERY_S3_SECRET_KEY=secret-s3")
		out, e := cmd.CombinedOutput()
		if e == nil {
			t.Fatal("unsafe CLI succeeded")
		}
		if strings.Contains(string(out), "secret-") || strings.Contains(string(out), "production.invalid") {
			t.Fatal("CLI leaked config")
		}
	}
	for _, endpoint := range []string{"http://s3.example", "http://192.168.1.1:9000", "https://user:password@s3.example", "https://s3.example/path"} {
		if secureEndpoint(endpoint) {
			t.Fatal("unsafe endpoint")
		}
	}
	if !secureEndpoint("https://s3.example") || !secureEndpoint("http://127.0.0.1:9000") {
		t.Fatal("secure endpoint rejected")
	}
	// Runtime DATABASE_URL/MEDIA_LOCAL_ROOT are never implicit recovery settings.
	t.Setenv("RECOVERY_STORAGE", "")
	t.Setenv("DATABASE_URL", "postgres://danger/prod")
	t.Setenv("MEDIA_LOCAL_ROOT", filepath.Join(t.TempDir(), "user-data"))
	if run() == nil {
		t.Fatal("implicit application env accepted")
	}
	oldArgs := os.Args
	defer func() { os.Args = oldArgs }()
	os.Args = []string{"recovery", "restore", "/archive", "--new-disposable-target"}
	root := filepath.Join(t.TempDir(), "user-volume")
	t.Setenv("RECOVERY_STORAGE", "local")
	t.Setenv("RECOVERY_LOCAL_ROOT", root)
	if run() == nil {
		t.Fatal("dangerous destination accepted")
	}
	if _, e := os.Stat(root); !os.IsNotExist(e) {
		t.Fatal("unsafe restore created a user directory before validating target")
	}
}
