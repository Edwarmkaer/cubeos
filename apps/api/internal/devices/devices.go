package devices

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

type Input struct {
	Name             string `json:"name"`
	ProtocolDeviceID string `json:"protocolDeviceId"`
}

var protocolPattern = regexp.MustCompile(`^[A-Z0-9_-]{2,12}$`)
var ErrInvalid = errors.New("invalid device input")
var ErrNotFound = errors.New("device not found")

func ValidName(name string) bool {
	return strings.TrimSpace(name) != "" && !strings.ContainsRune(name, 0) && utf8.ValidString(name) && utf8.RuneCountInString(name) <= 120
}
func (i Input) Validate() error {
	if !ValidName(i.Name) || !protocolPattern.MatchString(i.ProtocolDeviceID) {
		return ErrInvalid
	}
	return nil
}
