package ingestion

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestSharedNormalizationFixtures(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/contracts/fixtures/chasqui-v2/normalization-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name     string
		Payload  json.RawMessage
		Expected any
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			before := bytes.Clone(c.Payload)
			p, err := Validate(c.Payload)
			if err != nil {
				t.Fatal(err)
			}
			normalized := Normalize(p)
			b, err := json.Marshal(normalized)
			if err != nil {
				t.Fatal(err)
			}
			var got any
			if err = json.Unmarshal(b, &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.Expected) {
				t.Fatalf("got %s\nwant %#v", b, c.Expected)
			}
			if !bytes.Equal(before, c.Payload) {
				t.Fatal("mutated raw")
			}
		})
	}
}

func TestValidationRejectsInvalidWithoutCoercion(t *testing.T) {
	base := map[string]any{"v": 2, "id": "CS01", "m": "H", "n": 0, "u": 0, "t": 0, "st": 0, "fl": 0, "cam": 0, "sd": 0, "dp": 0}
	for _, tc := range []struct {
		key   string
		value any
	}{
		{"v", 1}, {"v", "2"}, {"n", -1}, {"n", 4294967296}, {"u", 4294967296}, {"t", -1}, {"st", 7}, {"fl", 256}, {"id", "x"}, {"m", "X"},
		{"cam", nil}, {"dp", 5}, {"rh", 10001}, {"p1", 9999}, {"gx", 2000001}, {"la", 900000001}, {"hd", 36000}, {"sourceId", "x"}, {"receivedAt", "2026-01-01"},
	} {
		t.Run(tc.key, func(t *testing.T) {
			p := map[string]any{}
			for k, v := range base {
				p[k] = v
			}
			p[tc.key] = tc.value
			b, _ := json.Marshal(p)
			if _, err := Validate(b); err == nil {
				t.Fatalf("accepted %s", b)
			}
		})
	}
	for _, raw := range []string{`null`, `[]`, `{} {}`, `{"v":2,"v":1}`, `{"v":2,"id":"CS01","m":"H","n":0,"u":0,"t":0,"st":0,"fl":0,"sd":0,"dp":0}`} {
		if _, err := Validate([]byte(raw)); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	// JSON Schema integers include integral decimal/exponent forms; no maximum
	// is declared on t/sd/gr/lx/sp. Keep those integers exact.
	raw := []byte(`{"v":2.0,"id":"CS01","m":"H","n":1e0,"u":0,"t":100000000000000000000,"st":0,"fl":0,"cam":0,"sd":0,"dp":0}`)
	if _, err := Validate(raw); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"0e1000000000", "1e1000000000", "0e-1000000000"} {
		b := bytes.Replace(raw, []byte(`100000000000000000000`), []byte(value), 1)
		if _, err := Validate(b); err == nil {
			t.Fatal("numeric expansion quota ignored")
		}
	}
}
