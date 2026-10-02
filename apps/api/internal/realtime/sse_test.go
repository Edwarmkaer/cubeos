package realtime

import (
	"bufio"
	"context"
	"errors"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSSEInitialExpirationAndCancellation(t *testing.T) {
	h := NewHub()
	defer h.Close()
	expiry := time.Now().Add(150 * time.Millisecond)
	s := NewSSE(h, func(context.Context, *http.Request, string) (identity.Principal, telemetry.Projection, error) {
		return identity.Principal{UserID: "A", ExpiresAt: expiry}, telemetry.Projection{Revision: 9007199254740993, Snapshot: telemetry.Object{"schemaVersion": "2.0"}}, nil
	})
	s.Heartbeat = 20 * time.Millisecond
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.ServeDevice(w, r, "device") }))
	defer server.Close()
	response, err := http.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	id, err := reader.ReadString('\n')
	if err != nil || id != "id: device:9007199254740993\n" {
		t.Fatal(id, err)
	}
	done := make(chan struct{})
	go func() {
		for {
			_, err := reader.ReadString('\n')
			if err != nil {
				close(done)
				return
			}
		}
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("expiration did not close")
	}
	h.mu.Lock()
	count := len(h.subscribers)
	h.mu.Unlock()
	if count != 0 {
		t.Fatal("subscriber leaked")
	}
}
func TestSSERejectsOwnerAndQueryBeforeHeaders(t *testing.T) {
	s := NewSSE(NewHub(), func(context.Context, *http.Request, string) (identity.Principal, telemetry.Projection, error) {
		return identity.Principal{}, telemetry.Projection{}, devices.ErrNotFound
	})
	for _, query := range []string{"", "?token=secret"} {
		w := httptest.NewRecorder()
		s.ServeDevice(w, httptest.NewRequest("GET", "http://local/events"+query, nil), "id")
		want := 404
		if query != "" {
			want = 400
		}
		if w.Code != want || strings.Contains(w.Header().Get("Content-Type"), "event-stream") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
func TestSSERecheckFailureCloses(t *testing.T) {
	calls := 0
	s := NewSSE(NewHub(), func(context.Context, *http.Request, string) (identity.Principal, telemetry.Projection, error) {
		calls++
		if calls > 1 {
			return identity.Principal{}, telemetry.Projection{}, errors.New("revoked session")
		}
		return identity.Principal{UserID: "A"}, telemetry.Projection{}, telemetry.ErrSnapshotUnavailable
	})
	s.Heartbeat = time.Millisecond
	w := httptest.NewRecorder()
	s.ServeDevice(w, httptest.NewRequest("GET", "http://local/events", nil), "id")
	if calls != 2 {
		t.Fatal(calls)
	}
}

func TestSSESlowTCPClientDeadlineDoesNotBlockOtherDevice(t *testing.T) {
	h := NewHub()
	defer h.Close()
	finished := make(chan struct{}, 1)
	s := NewSSE(h, func(_ context.Context, r *http.Request, _ string) (identity.Principal, telemetry.Projection, error) {
		snapshot := telemetry.Object{"schemaVersion": "2.0"}
		if r.URL.Path == "/slow" {
			snapshot["padding"] = strings.Repeat("x", 4<<20)
		}
		return identity.Principal{UserID: "A"}, telemetry.Projection{Revision: 1, Snapshot: snapshot}, nil
	})
	s.WriteTimeout = 50 * time.Millisecond
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.ServeDevice(w, r, r.URL.Path)
		if r.URL.Path == "/slow" {
			finished <- struct{}{}
		}
	}))
	writing := make(chan struct{}, 1)
	server.Listener = writeObservedListener{server.Listener, writing}
	server.Start()
	defer server.Close()
	conn, err := net.Dial("tcp", server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if tcp, ok := conn.(*net.TCPConn); ok {
		_ = tcp.SetReadBuffer(1024)
	}
	if _, err = conn.Write([]byte("GET /slow HTTP/1.1\r\nHost: local\r\n\r\n")); err != nil {
		t.Fatal(err)
	}
	// Serialization is outside the write deadline. Wait for the actual network
	// boundary so a concurrent build/race instrumentation cannot skew this gate.
	select {
	case <-writing:
	case <-time.After(10 * time.Second):
		t.Fatal("slow write never started")
	}
	response, err := http.Get(server.URL + "/fast")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	line, err := bufio.NewReader(response.Body).ReadString('\n')
	if err != nil || line != "id: /fast:1\n" {
		t.Fatal(line, err)
	}
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("slow write leaked handler")
	}
}

type writeObservedListener struct {
	net.Listener
	writing chan struct{}
}

func (l writeObservedListener) Accept() (net.Conn, error) {
	c, e := l.Listener.Accept()
	if e != nil {
		return nil, e
	}
	return writeObservedConn{c, l.writing}, nil
}

type writeObservedConn struct {
	net.Conn
	writing chan struct{}
}

func (c writeObservedConn) Write(b []byte) (int, error) {
	select {
	case c.writing <- struct{}{}:
	default:
	}
	return c.Conn.Write(b)
}
