package cloudrelay

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

type readerFunc func(context.Context) (Replica, error)

func (f readerFunc) Latest(c context.Context) (Replica, error) { return f(c) }

func TestHTTPPublisherNeverFollowsRedirectOrLeaksToken(t *testing.T) {
	leaked := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked = true; w.WriteHeader(200) }))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 307) }))
	defer origin.Close()
	p := newHTTPPublisher(origin.URL, "private-token")
	if err := p.Publish(context.Background(), Replica{}); err == nil {
		t.Fatal("redirect must fail")
	}
	if leaked {
		t.Fatal("credential followed redirect")
	}
}
func TestHTTPPublisherStopsOnRevocationAndStaleRevision(t *testing.T) {
	for _, code := range []int{401, 403, 409} {
		t.Run(http.StatusText(code), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(code) }))
			defer server.Close()
			err := newHTTPPublisher(server.URL, "private-token").Publish(context.Background(), Replica{})
			want := ErrUnauthorized
			if code == 409 {
				want = ErrStale
			}
			if !errors.Is(err, want) {
				t.Fatalf("status %d: %v", code, err)
			}
		})
	}
}
func TestRelayConflatesUpdatesWithoutBlockingLocalReader(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var mu sync.Mutex
	latest := "1"
	var sent []string
	var times []time.Time
	reader := readerFunc(func(context.Context) (Replica, error) {
		mu.Lock()
		defer mu.Unlock()
		return Replica{RevisionID: latest}, nil
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v Replica
		if e := json.NewDecoder(r.Body).Decode(&v); e != nil {
			t.Error(e)
		}
		mu.Lock()
		sent = append(sent, v.RevisionID)
		times = append(times, time.Now())
		n := len(sent)
		if n == 1 {
			latest = "100"
		}
		mu.Unlock()
		if n == 1 {
			time.Sleep(1100 * time.Millisecond)
		} else {
			defer cancel()
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	err := Run(ctx, reader, newHTTPPublisher(server.URL, "token"), Options{})
	if err != nil && !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(sent) != 2 || sent[0] != "1" || sent[1] != "100" {
		t.Fatalf("not conflated: %v", sent)
	}
	if times[1].Sub(times[0]) < time.Second {
		t.Fatal("exceeded 1 Hz")
	}
}
func TestRelayRevocationDoesNotRetry(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(403) }))
	defer s.Close()
	err := Run(ctx, readerFunc(func(context.Context) (Replica, error) { return Replica{RevisionID: "1"}, nil }), newHTTPPublisher(s.URL, "token"), Options{})
	if !errors.Is(err, ErrUnauthorized) || calls != 1 {
		t.Fatalf("revocation was retried: calls=%d err=%v", calls, err)
	}
}

type publisherFunc func(context.Context, Replica) error

func (f publisherFunc) Publish(c context.Context, r Replica) error { return f(c, r) }
func TestDisableDuringReadPreventsPublication(t *testing.T) {
	enabled := true
	reader := readerFunc(func(context.Context) (Replica, error) { enabled = false; return Replica{RevisionID: "1"}, nil })
	publisher := publisherFunc(func(context.Context, Replica) error { t.Fatal("published after disable"); return nil })
	if err := Run(context.Background(), reader, publisher, Options{Enabled: func() bool { return enabled }}); err != nil {
		t.Fatal(err)
	}
}
