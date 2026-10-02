package ingestion

import (
	"encoding/json"
	"os"
	"testing"
)

// The preserved hardware schema is the independent oracle for every property,
// including optional keys accepted on any m, and every conditional requirement.
func TestEverySchemaNumericBoundTypeAndConditionalRequirement(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/contracts/schemas/uplink-v2.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Properties map[string]struct {
			Type    string
			Minimum *int64
			Maximum *int64
		}
		AllOf []struct {
			If struct {
				Properties struct{ M struct{ Const string } }
			}
			Then struct{ Required []string }
		}
	}
	if err = json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile("../../../../packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json")
	if err != nil {
		t.Fatal(err)
	}
	var examples []map[string]any
	if err = json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	base := examples[0]
	check := func(p map[string]any, want bool) {
		t.Helper()
		b, _ := json.Marshal(p)
		_, err := Validate(b)
		if (err == nil) != want {
			t.Fatalf("accepted=%v want %v: %s %v", err == nil, want, b, err)
		}
	}
	clone := func(p map[string]any) map[string]any {
		r := map[string]any{}
		for k, v := range p {
			r[k] = v
		}
		return r
	}
	for k, prop := range schema.Properties {
		if prop.Type != "integer" {
			continue
		}
		t.Run(k, func(t *testing.T) {
			p := clone(base)
			p[k] = *prop.Minimum
			check(p, true)
			p[k] = *prop.Minimum - 1
			check(p, false)
			if prop.Maximum != nil {
				p[k] = *prop.Maximum
				check(p, true)
				p[k] = *prop.Maximum + 1
				check(p, false)
			}
			for _, bad := range []any{nil, true, "0", 0.5} {
				p[k] = bad
				check(p, false)
			}
		})
	}
	for _, conditional := range schema.AllOf {
		for _, e := range examples {
			if e["m"] != conditional.If.Properties.M.Const {
				continue
			}
			check(e, true)
			for _, k := range conditional.Then.Required {
				p := clone(e)
				delete(p, k)
				check(p, false)
			}
			break
		}
	}
}
