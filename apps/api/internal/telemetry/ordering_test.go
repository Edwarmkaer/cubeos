package telemetry

import (
	"testing"
	"time"
)

func TestOrderingWrapDelayedAndConfirmedRestart(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	s := OrderState{}
	check := func(n, u uint32, boot bool, seconds int, want string, epoch int64) {
		t.Helper()
		d := s.Observe(n, u, boot, now.Add(time.Duration(seconds)*time.Second))
		if d.Kind != want || d.Epoch != epoch {
			t.Fatalf("n=%d u=%d: %#v want %s/%d", n, u, d, want, epoch)
		}
	}
	check(4294967294, 100000, false, 0, "project", 0)
	check(4294967295, 100100, false, 1, "project", 0)
	check(0, 100200, false, 2, "project", 1)
	check(4294967294, 100000, false, 3, "late", 0)
	check(1, 100, false, 4, "ambiguous", 1) // uptime drop alone never opens epoch
	check(1, 100, true, 5, "restart_candidate", 1)
	check(2, 200, true, 6, "project", 2)
	check(10, 100000, false, 7, "ambiguous", 2) // unseen frame from previous epoch
	check(3, 300, false, 8, "project", 2)
}
func TestUptimeWrapAndInconsistentSequence(t *testing.T) {
	now := time.Now()
	s := OrderState{}
	if s.Observe(100, 4294967200, false, now).Kind != "project" {
		t.Fatal("first")
	}
	if s.Observe(101, 10, false, now.Add(time.Second)).Kind != "project" {
		t.Fatal("uptime wrap")
	}
	if s.Observe(101, 11, false, now.Add(2*time.Second)).Kind != "ambiguous" {
		t.Fatal("same sequence different uptime")
	}
}
