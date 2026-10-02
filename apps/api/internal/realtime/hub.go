// Package realtime distributes invalidations, never uncommitted telemetry.
package realtime

import (
	"context"
	"github.com/jackc/pgx/v5"
	"strings"
	"sync"
	"time"
)

const Channel = "cubeos_snapshot"

type Hub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]struct{}
	closed      bool
}

func NewHub() *Hub { return &Hub{subscribers: make(map[string]map[chan struct{}]struct{})} }
func (h *Hub) Subscribe(device string) (<-chan struct{}, func()) {
	device = strings.ToLower(device)
	h.mu.Lock()
	defer h.mu.Unlock()
	ch := make(chan struct{}, 1)
	if h.closed {
		close(ch)
	} else {
		if h.subscribers[device] == nil {
			h.subscribers[device] = make(map[chan struct{}]struct{})
		}
		h.subscribers[device][ch] = struct{}{}
	}
	var once sync.Once
	return ch, func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			if _, ok := h.subscribers[device][ch]; ok {
				delete(h.subscribers[device], ch)
				close(ch)
				if len(h.subscribers[device]) == 0 {
					delete(h.subscribers, device)
				}
			}
		})
	}
}
func (h *Hub) Notify(device string) {
	device = strings.ToLower(device)
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subscribers[device] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for device, channels := range h.subscribers {
		for ch := range channels {
			close(ch)
		}
		delete(h.subscribers, device)
	}
}

// Run owns one dedicated LISTEN connection outside the request pool. Notices
// are transactional in PostgreSQL. Reconnect invalidates every active device;
// SSE heartbeat also reconciles losses while the listener was unavailable.
func (h *Hub) Run(ctx context.Context, databaseURL string) {
	defer h.Close()
	for ctx.Err() == nil {
		attempt, cancel := context.WithTimeout(ctx, 5*time.Second)
		conn, err := pgx.Connect(attempt, databaseURL)
		if err == nil {
			_, err = conn.Exec(attempt, "LISTEN "+Channel)
		}
		cancel()
		if err == nil {
			h.mu.Lock()
			for _, channels := range h.subscribers {
				for ch := range channels {
					select {
					case ch <- struct{}{}:
					default:
					}
				}
			}
			h.mu.Unlock()
			for ctx.Err() == nil {
				notice, e := conn.WaitForNotification(ctx)
				if e != nil {
					break
				}
				h.Notify(notice.Payload)
			}
		}
		if conn != nil {
			closing, cancel := context.WithTimeout(context.Background(), time.Second)
			_ = conn.Close(closing)
			cancel()
		}
		timer := time.NewTimer(time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}
