//go:build linux

package ingestion

import (
	"context"
	"fmt"
	"go.bug.st/serial"
	"golang.org/x/sys/unix"
	"io"
	"os"
	"sync"
	"testing"
	"time"
)

func TestPhysicalPortPTYFragmentationAndCancellation(t *testing.T) {
	fd, err := unix.Open("/dev/ptmx", unix.O_RDWR|unix.O_NOCTTY|unix.O_CLOEXEC, 0)
	if err != nil {
		t.Fatal(err)
	}
	master := os.NewFile(uintptr(fd), "pty")
	defer master.Close()
	if err = unix.IoctlSetPointerInt(fd, unix.TIOCSPTLCK, 0); err != nil {
		t.Fatal(err)
	}
	number, err := unix.IoctlGetInt(fd, unix.TIOCGPTN)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	opened := make(chan struct{})
	var once sync.Once
	r := &evidenceStore{observed: make(chan struct{}, 2)}
	done := make(chan error, 1)
	go func() {
		done <- RunSerial(ctx, func() (io.ReadCloser, error) {
			port, e := serial.Open(fmt.Sprintf("/dev/pts/%d", number), &serial.Mode{BaudRate: 57600, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit})
			if e == nil {
				e = port.SetReadTimeout(50 * time.Millisecond)
			}
			once.Do(func() { close(opened) })
			return port, e
		}, NewService(r), "source", time.Second)
	}()
	select {
	case <-opened:
	case <-time.After(time.Second):
		t.Fatal("port open blocked")
	}
	// A malformed frame followed by a valid one exercises the actual TTY reader.
	for _, part := range []string{"{bad}\r\n", envelopeH[:17], envelopeH[17:] + "\n"} {
		if _, err = master.Write([]byte(part)); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		select {
		case <-r.observed:
		case <-time.After(2 * time.Second):
			t.Fatal("PTY frame not consumed")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("PTY cancellation blocked")
	}
	if len(r.rows) != 2 || r.rows[0].Cause != "invalid_envelope" || r.rows[1].Patch == nil {
		t.Fatal(r.rows)
	}
}
