package ingestion

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

const MaxPayloadBytes = 8192

var ErrInvalid = errors.New("invalid uplink v2")
var devicePattern = regexp.MustCompile(`^[A-Z0-9_-]{2,12}$`)

type Payload map[string]any

// Bounds mirror the preserved uplink-v2 schema. Zero maximum means unbounded.
var bounds = map[string][2]int64{
	"v": {2, 2}, "n": {0, 4294967295}, "u": {0, 4294967295}, "t": {0, 0}, "st": {0, 6}, "fl": {0, 255},
	"bv": {0, 20000}, "bi": {-20000, 20000}, "bp": {-200000, 200000}, "cam": {0, 1}, "sd": {0, 0}, "dp": {0, 4},
	"t1": {-5000, 10000}, "rh": {0, 10000}, "p1": {10000, 120000}, "gr": {0, 0}, "t2": {-5000, 10000}, "p2": {10000, 120000}, "ti": {-5000, 15000},
	"lx": {0, 0}, "uvr": {0, 4095}, "uvm": {0, 3300}, "ax": {-16000, 16000}, "ay": {-16000, 16000}, "az": {-16000, 16000},
	"gx": {-2000000, 2000000}, "gy": {-2000000, 2000000}, "gz": {-2000000, 2000000}, "la": {-900000000, 900000000}, "lo": {-1800000000, 1800000000},
	"al": {-10000000, 100000000}, "sp": {0, 0}, "hd": {0, 35999}, "fx": {0, 3}, "sa": {0, 99},
}
var required = map[string][]string{"H": {"cam", "sd", "dp"}, "E": {"t1", "rh", "p1", "gr"}, "O": {"lx", "uvr", "uvm"}, "I": {"ax", "ay", "az", "gx", "gy", "gz"}, "G": {"la", "lo", "al", "sp", "hd", "fx", "sa"}}

// Validate never coerces, inserts defaults, removes keys or modifies raw.
// Duplicate keys are ambiguous at a JSON boundary and are rejected explicitly.
func Validate(raw []byte) (Payload, error) {
	if len(raw) > MaxPayloadBytes {
		return nil, ErrInvalid
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	token, err := dec.Token()
	if err != nil || token != json.Delim('{') {
		return nil, ErrInvalid
	}
	p := Payload{}
	for dec.More() {
		token, err = dec.Token()
		if err != nil {
			return nil, ErrInvalid
		}
		k, ok := token.(string)
		if !ok {
			return nil, ErrInvalid
		}
		if _, ok = p[k]; ok {
			return nil, ErrInvalid
		}
		var v any
		if err = dec.Decode(&v); err != nil {
			return nil, ErrInvalid
		}
		p[k] = v
	}
	if _, err = dec.Token(); err != nil {
		return nil, ErrInvalid
	}
	if err = dec.Decode(new(any)); err != io.EOF {
		return nil, ErrInvalid
	}
	id, ok := p["id"].(string)
	if !ok || !devicePattern.MatchString(id) {
		return nil, ErrInvalid
	}
	m, ok := p["m"].(string)
	if !ok || required[m] == nil {
		return nil, ErrInvalid
	}
	for _, k := range append([]string{"v", "id", "m", "n", "u", "t", "st", "fl"}, required[m]...) {
		if _, ok = p[k]; !ok {
			return nil, ErrInvalid
		}
	}
	for k, v := range p {
		if k == "id" || k == "m" {
			continue
		}
		b, known := bounds[k]
		num, ok := v.(json.Number)
		if !known || !ok {
			return nil, ErrInvalid
		}
		// Limit exponent magnitude before constructing a rational: bounded raw can
		// otherwise request enormous allocations with e.g. 1e999999999.
		if i := strings.IndexAny(string(num), "eE"); i >= 0 {
			exponent, err := strconv.Atoi(string(num)[i+1:])
			if err != nil || exponent > 10000 || exponent < -10000 {
				return nil, ErrInvalid
			}
		}
		f, _, err := big.ParseFloat(string(num), 10, 256, big.ToNearestEven)
		if err != nil || f.IsInf() || f.MantExp(nil) > 32768 || f.MantExp(nil) < -32768 {
			return nil, ErrInvalid
		}
		rat, ok := new(big.Rat).SetString(string(num))
		if !ok || !rat.IsInt() {
			return nil, ErrInvalid
		}
		n := rat.Num()
		if n.Cmp(big.NewInt(b[0])) < 0 || (b[1] != 0 && n.Cmp(big.NewInt(b[1])) > 0) {
			return nil, ErrInvalid
		}
		// Canonical exact integer removes JSON lexical differences from deduplication.
		p[k] = json.Number(n.String())
	}
	return p, nil
}
