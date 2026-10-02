package config

import (
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	"net"
	"net/url"
	"strconv"
)

type Config struct {
	Address, DatabaseURL, Origin                 string
	Port                                         string
	IngestionAddress, SerialPort, SerialSourceID string
	SerialBaud                                   int
}

func Load(get func(string) string) (Config, error) {
	value := func(k, fallback string) string {
		if v := get(k); v != "" {
			return v
		}
		return fallback
	}
	mode := value("DEPLOYMENT_MODE", "local")
	auth := value("AUTH_MODE", "local")
	if mode != "local" && mode != "public" {
		return Config{}, errors.New("invalid deployment mode")
	}
	if mode == "public" && auth == "local" {
		return Config{}, errors.New("public deployment requires Clerk")
	}
	if auth != "local" {
		return Config{}, errors.New("Clerk authentication is not implemented; refusing startup")
	}
	port := value("PORT", "8080")
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return Config{}, errors.New("invalid port")
	}
	host := value("LISTEN_HOST", "127.0.0.1")
	container := get("LOCAL_CONTAINER")
	if container != "" && container != "true" && container != "false" {
		return Config{}, errors.New("invalid container flag")
	}
	ip := net.ParseIP(host)
	if (ip == nil || !ip.IsLoopback()) && !(container == "true" && host == "0.0.0.0") {
		return Config{}, errors.New("local listener must be loopback or explicit isolated container")
	}
	origin := value("ALLOWED_ORIGIN", "http://localhost:3000")
	o, err := url.Parse(origin)
	if err != nil || o.Scheme != "http" || o.User != nil || o.Path != "" || o.RawQuery != "" || o.Fragment != "" || (o.Hostname() != "localhost" && !isLoopback(o.Hostname())) || o.Port() == "" {
		return Config{}, errors.New("allowed origin must be a local http origin with explicit port")
	}
	db := get("DATABASE_URL")
	u, err := url.Parse(db)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" {
		return Config{}, errors.New("DATABASE_URL must be a PostgreSQL connection URL")
	}
	c := Config{Address: net.JoinHostPort(host, port), DatabaseURL: db, Origin: origin, Port: port, IngestionAddress: get("INGESTION_ADDRESS"), SerialPort: get("SERIAL_PORT"), SerialSourceID: get("SERIAL_SOURCE_ID")}
	if c.IngestionAddress != "" {
		h, p, e := net.SplitHostPort(c.IngestionAddress)
		ip := net.ParseIP(h)
		n, e2 := strconv.Atoi(p)
		if e != nil || e2 != nil || ip == nil || (!ip.IsLoopback() && !ip.IsPrivate()) || n < 1 || n > 65535 || p == port {
			return Config{}, errors.New("ingestion listener needs explicit interface IP and distinct port")
		}
	}
	baud := get("SERIAL_BAUD")
	if c.SerialPort != "" || c.SerialSourceID != "" || baud != "" {
		var u pgtype.UUID
		n, e := strconv.Atoi(baud)
		if c.SerialPort == "" || len(c.SerialSourceID) != 36 || u.Scan(c.SerialSourceID) != nil || !u.Valid || e != nil || n < 1 || n > 4000000 {
			return Config{}, errors.New("serial needs port, source UUID and explicit baudrate")
		}
		c.SerialBaud = n
	}
	return c, nil
}
func isLoopback(host string) bool { ip := net.ParseIP(host); return ip != nil && ip.IsLoopback() }
