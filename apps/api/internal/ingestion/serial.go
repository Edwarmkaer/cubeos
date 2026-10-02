package ingestion

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"time"
)

// TransportOperationTimeout bounds DB work, never the serial worker lifetime.
const TransportOperationTimeout = 5 * time.Second

// ReadSerial consumes LF-delimited envelopes. CRLF is accepted; a disconnected
// partial line is audited and never joined to bytes from a new connection.
// A blocking Reader must be closed by its owner on cancellation (RunSerial does).
func ReadSerial(ctx context.Context, r io.Reader, s *Service, source string) error {
	buffer := make([]byte, 4096)
	line := make([]byte, 0, MaxEnvelopeBytes)
	hash := sha256.New()
	var size int64
	flush := func(partial bool) error {
		if size == 0 {
			return nil
		}
		operation, cancel := context.WithTimeout(ctx, TransportOperationTimeout)
		defer cancel()
		var err error
		if partial || size > MaxEnvelopeBytes {
			cause := "envelope_too_large"
			if partial {
				cause = "incomplete_frame"
			}
			_, err = s.rejectFrame(operation, source, line, size, fmt.Sprintf("%x", hash.Sum(nil)), cause)
		} else {
			raw := line
			if raw[len(raw)-1] == '\r' {
				raw = raw[:len(raw)-1]
			}
			_, err = s.IngestEnvelope(operation, source, raw)
		}
		line = line[:0]
		size = 0
		hash.Reset()
		return err
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, err := r.Read(buffer)
		for _, b := range buffer[:n] {
			if b == '\n' {
				if e := flush(false); e != nil {
					return e
				}
				continue
			}
			size++
			hash.Write([]byte{b})
			if len(line) < MaxEnvelopeBytes {
				line = append(line, b)
			}
		}
		if err != nil {
			if e := flush(true); e != nil {
				return e
			}
			return err
		}
		if n == 0 {
			if err = waitSerial(ctx, 10*time.Millisecond); err != nil {
				return err
			}
		}
	}
}
func waitSerial(ctx context.Context, delay time.Duration) error {
	t := time.NewTimer(delay)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// RunSerial retries port-open/read failures with a bounded delay. Each connection
// owns one cancellation goroutine; it ends before reconnection.
func RunSerial(ctx context.Context, open func() (io.ReadCloser, error), s *Service, source string, retry time.Duration) error {
	if retry < 10*time.Millisecond {
		return errors.New("serial retry must be at least 10ms")
	}
	for ctx.Err() == nil {
		port, err := open()
		if err == nil {
			ended := make(chan struct{})
			closed := make(chan struct{})
			go func() {
				defer close(closed)
				select {
				case <-ctx.Done():
					port.Close()
				case <-ended:
				}
			}()
			err = ReadSerial(ctx, port, s, source)
			close(ended)
			port.Close()
			<-closed
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// Storage failures and port failures both back off; no unbounded in-memory queue.
		if err = waitSerial(ctx, retry); err != nil {
			return err
		}
	}
	return ctx.Err()
}
