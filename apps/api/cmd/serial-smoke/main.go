//go:build linux

// serial-smoke is an explicit test-only PTY writer. It is not shipped in the API image.
package main

import (
	"bufio"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	fd, e := unix.Open("/dev/ptmx", unix.O_RDWR|unix.O_NOCTTY|unix.O_CLOEXEC, 0)
	if e != nil {
		panic(e)
	}
	master := os.NewFile(uintptr(fd), "smoke-pty")
	defer master.Close()
	if e = unix.IoctlSetPointerInt(fd, unix.TIOCSPTLCK, 0); e != nil {
		panic(e)
	}
	n, e := unix.IoctlGetInt(fd, unix.TIOCGPTN)
	if e != nil {
		panic(e)
	}
	name := fmt.Sprintf("/dev/pts/%d", n)
	slave, e := os.OpenFile(name, os.O_RDWR|unix.O_NOCTTY, 0)
	if e != nil {
		panic(e)
	}
	defer slave.Close()
	if e = slave.Chmod(0o660); e != nil {
		panic(e)
	}
	term, e := unix.IoctlGetTermios(int(slave.Fd()), unix.TCGETS)
	if e != nil {
		panic(e)
	}
	term.Lflag &^= unix.ECHO | unix.ICANON | unix.ISIG
	term.Oflag &^= unix.OPOST
	term.Iflag &^= unix.ICRNL | unix.IXON
	if e = unix.IoctlSetTermios(int(slave.Fd()), unix.TCSETS, term); e != nil {
		panic(e)
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() { <-signals; master.Close(); os.Exit(0) }()
	fmt.Println(name)
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024), 32768)
	for scanner.Scan() {
		if _, e = master.Write(append(append([]byte{}, scanner.Bytes()...), 10)); e != nil {
			panic(e)
		}
	}
	if e = scanner.Err(); e != nil {
		panic(e)
	}
}
