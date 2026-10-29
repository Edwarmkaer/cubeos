package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestPrepareReceiverRejectsUntrustedInputBeforeDatabase(t *testing.T) {
	for _, input := range []string{`{}`, `{"bindingId":"bad"}`, `{"bindingId":"85f25882-661d-4e01-82d0-48c97b7c8c45","extra":true}`, `{"bindingId":"85f25882-661d-4e01-82d0-48c97b7c8c45"} {}`, strings.Repeat("x", 4097)} {
		var output bytes.Buffer
		if e := prepareReceiver(context.Background(), nil, strings.NewReader(input), &output, "local"); e == nil {
			t.Fatalf("accepted %q", input)
		}
		if output.Len() != 0 {
			t.Fatal("partial output")
		}
	}
	var out bytes.Buffer
	if e := prepareReceiver(context.Background(), nil, strings.NewReader(`{"bindingId":"85f25882-661d-4e01-82d0-48c97b7c8c45"}`), &out, "public"); e == nil {
		t.Fatal("public mode allowed")
	}
}
