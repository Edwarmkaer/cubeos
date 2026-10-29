package cloudrelay

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

type Config struct {
	SchemaVersion int    `json:"schemaVersion"`
	ChannelID     string `json:"channelId"`
	DeviceID      string `json:"deviceId"`
	Endpoint      string `json:"endpoint"`
	PublishToken  string `json:"publishToken"`
	ExpiresAt     int64  `json:"expiresAt"`
}

var uuid = regexp.MustCompile(`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var endpointHost = regexp.MustCompile(`^[a-z0-9-]+\.convex\.site$`)
var token = regexp.MustCompile(`^[a-f0-9]{64}$`)
var errConfig = errors.New("invalid private cloud configuration")

func decode(reader io.Reader) (Config, error) {
	var c Config
	body, readErr := io.ReadAll(io.LimitReader(reader, 4097))
	if readErr != nil || len(body) > 4096 {
		return Config{}, errConfig
	}
	d := json.NewDecoder(bytes.NewReader(body))
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return Config{}, errConfig
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return Config{}, errConfig
	}
	u, err := url.Parse(c.Endpoint)
	if err != nil || c.SchemaVersion != 1 || !uuid.MatchString(c.ChannelID) || !uuid.MatchString(c.DeviceID) || !token.MatchString(c.PublishToken) || u.Scheme != "https" || !endpointHost.MatchString(u.Hostname()) || u.Port() != "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/telemetry/v1/snapshot" || c.ExpiresAt <= time.Now().UnixMilli() || c.ExpiresAt > time.Now().Add(8*time.Hour).UnixMilli() {
		return Config{}, errConfig
	}
	return c, nil
}
func ReadConfig(path string) (Config, error) {
	before, err := os.Lstat(path)
	if err != nil || !before.Mode().IsRegular() || before.Mode().Perm() != 0600 || before.Size() > 4096 {
		return Config{}, errConfig
	}
	f, err := os.Open(path)
	if err != nil {
		return Config{}, errConfig
	}
	defer f.Close()
	after, err := f.Stat()
	if err != nil || !os.SameFile(before, after) {
		return Config{}, errConfig
	}
	return decode(f)
}
func Prepare(reader io.Reader, directory, expectedDevice string) error {
	c, err := decode(reader)
	if err != nil || c.DeviceID != expectedDevice {
		return errConfig
	}
	dir, err := os.Lstat(directory)
	if err != nil || !dir.IsDir() || dir.Mode()&os.ModeSymlink != 0 {
		return errConfig
	}
	path := filepath.Join(directory, "config.json")
	if s, e := os.Lstat(path); e == nil && (!s.Mode().IsRegular() || s.Mode().Perm() != 0600) {
		return errConfig
	} else if e != nil && !os.IsNotExist(e) {
		return errConfig
	}
	f, err := os.CreateTemp(directory, ".relay-*.tmp")
	if err != nil {
		return errConfig
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err == nil {
		err = json.NewEncoder(f).Encode(c)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil || closeErr != nil {
		return errConfig
	}
	if os.Rename(f.Name(), path) != nil {
		return errConfig
	}
	return nil
}
func (c Config) Publisher() Publisher { return newHTTPPublisher(c.Endpoint, c.PublishToken) }
func (c Config) Options() Options {
	return Options{ChannelID: c.ChannelID, DeviceID: c.DeviceID, ExpiresAt: time.UnixMilli(c.ExpiresAt)}
}
