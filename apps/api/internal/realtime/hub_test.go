package realtime

import (
	"sync"
	"testing"
)

func TestHubCoalescesSlowSubscribersAndIsolatesDevices(t *testing.T) {
	h := NewHub()
	a, cancelA := h.Subscribe("A")
	defer cancelA()
	b, cancelB := h.Subscribe("B")
	defer cancelB()
	for i := 0; i < 10000; i++ {
		h.Notify("A")
	}
	if len(a) != 1 || len(b) != 0 {
		t.Fatal("unbounded queue or device leak")
	}
	h.Notify("B")
	select {
	case <-b:
	default:
		t.Fatal("slow A blocked B")
	}
	cancelA()
	cancelA()
	h.Close()
	if _, ok := <-b; ok {
		t.Fatal("shutdown did not close subscriber")
	}
}

func TestHubConcurrentCleanup(t *testing.T) {
	h := NewHub()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, cancel := h.Subscribe("A"); h.Notify("A"); cancel() }()
	}
	wg.Wait()
	h.Close()
	ch, cancel := h.Subscribe("A")
	defer cancel()
	if _, ok := <-ch; ok {
		t.Fatal("closed hub admitted connection")
	}
}

func TestHubUUIDCaseAliasesReceiveCommittedInvalidation(t *testing.T) {
	h := NewHub()
	defer h.Close()
	ch, cancel := h.Subscribe("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")
	defer cancel()
	h.Notify("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	select {
	case <-ch:
	default:
		t.Fatal("valid uppercase UUID missed committed update")
	}
}
