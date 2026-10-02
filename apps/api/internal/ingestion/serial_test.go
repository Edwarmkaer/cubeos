package ingestion

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

type evidenceStore struct {
	rows     []Reception
	observed chan struct{}
}

func (r *evidenceStore) Store(_ context.Context, _ string, v Reception) (IngestResult, error) {
	r.rows = append(r.rows, v)
	if r.observed != nil {
		r.observed <- struct{}{}
	}
	status := "accepted"
	if v.Cause != "" {
		status = "rejected"
	}
	return IngestResult{Status: status, Cause: v.Cause}, nil
}

const envelopeH = `{"envelopeVersion":1,"payload":{"v":2,"id":"CS01","m":"H","n":0,"u":0,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0},"receiver":{"rssiDbm":-80,"snrDb":4}}`

type fragments struct {
	data  string
	chunk int
}

type finalRead struct{ data []byte }

func (r *finalRead) Read(p []byte) (int, error) { return copy(p, r.data), io.ErrUnexpectedEOF }
func TestSerialConsumesBytesReturnedTogetherWithDisconnect(t *testing.T) {
	r := &evidenceStore{}
	err := ReadSerial(context.Background(), &finalRead{[]byte(envelopeH + "\n" + envelopeH[:7])}, NewService(r), "source")
	if !errors.Is(err, io.ErrUnexpectedEOF) || len(r.rows) != 2 || r.rows[0].Patch == nil || r.rows[1].Cause != "incomplete_frame" || r.rows[1].RawSize != 7 {
		t.Fatal(err, r.rows)
	}
}

func (r *fragments) Read(p []byte) (int, error) {
	if r.data == "" {
		return 0, io.EOF
	}
	n := min(len(p), r.chunk, len(r.data))
	copy(p, r.data[:n])
	r.data = r.data[n:]
	return n, nil
}
func TestSerialFragmentedCRLFRecoveryAndEvidence(t *testing.T) {
	for _, chunk := range []int{1, 7, 4096} {
		r := &evidenceStore{}
		oversized := strings.Repeat("x", MaxEnvelopeBytes+19)
		stream := envelopeH + "\r\n{bad}\n" + oversized + "\n" + envelopeH + "\n"
		err := ReadSerial(context.Background(), &fragments{stream, chunk}, NewService(r), "registered")
		if err != io.EOF || len(r.rows) != 4 {
			t.Fatalf("chunk %d rows %d err %v", chunk, len(r.rows), err)
		}
		if r.rows[0].Patch.DeviceID() != "CS01" || r.rows[0].Metadata.RSSIDbm == nil || *r.rows[0].Metadata.RSSIDbm != -80 || r.rows[1].Cause != "invalid_envelope" || r.rows[3].Patch == nil {
			t.Fatal(r.rows)
		}
		big := r.rows[2]
		if big.Cause != "envelope_too_large" || big.RawSize != int64(len(oversized)) || len(big.Raw) != MaxPayloadBytes || big.RawHash != fmt.Sprintf("%x", sha256.Sum256([]byte(oversized))) {
			t.Fatal(big)
		}
	}
}
func TestSerialIncompleteAndCancelledReader(t *testing.T) {
	r := &evidenceStore{}
	if err := ReadSerial(context.Background(), bytes.NewBufferString(envelopeH), NewService(r), "source"); err != io.EOF || len(r.rows) != 1 || r.rows[0].Cause != "incomplete_frame" {
		t.Fatal(err, r.rows)
	}
	ctx, cancel := context.WithCancel(context.Background())
	pr, pw := io.Pipe()
	defer pw.Close()
	done := make(chan error, 1)
	go func() {
		done <- RunSerial(ctx, func() (io.ReadCloser, error) { return pr, nil }, NewService(&evidenceStore{}), "source", time.Second)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("blocked on cancellation")
	}
}
func TestSerialReconnectDoesNotJoinPartialFramesOrBusyLoop(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := &evidenceStore{}
	attempts := 0
	first := time.Now()
	err := RunSerial(ctx, func() (io.ReadCloser, error) {
		attempts++
		switch attempts {
		case 1:
			return nil, errors.New("port absent")
		case 2:
			return io.NopCloser(strings.NewReader(envelopeH[:15])), nil
		case 3:
			return io.NopCloser(strings.NewReader(envelopeH + "\n")), nil
		default:
			cancel()
			return nil, errors.New("done")
		}
	}, NewService(r), "source", 20*time.Millisecond)
	if !errors.Is(err, context.Canceled) || attempts != 4 || time.Since(first) < 50*time.Millisecond || len(r.rows) != 2 || r.rows[0].Cause != "incomplete_frame" || r.rows[1].Patch == nil {
		t.Fatal(err, attempts, r.rows)
	}
}
func TestEnvelopeRejectsClientAuthorityAndDuplicateKeys(t *testing.T) {
	for _, raw := range []string{`{"envelopeVersion":1,"envelopeVersion":1,"payload":{}}`, strings.TrimSuffix(envelopeH, "}") + `,"sourceId":"forged"}`, strings.TrimSuffix(envelopeH, "}") + `,"receivedAt":"2020-01-01"}`, `{"envelopeVersion":1,"payload":null}`, `{"envelopeVersion":1,"payload":{},"receiver":null}`, strings.Replace(envelopeH, `"rssiDbm":-80`, `"rssiDbm":null`, 1)} {
		r := &evidenceStore{}
		result, err := NewService(r).IngestEnvelope(context.Background(), "source", []byte(raw))
		if err != nil || result.Cause != "invalid_envelope" {
			t.Fatal(raw, result, err)
		}
	}
}
