package config

import (
	"errors"
	"net"
	"net/url"
	"strconv"
)

type Config struct {
	Address, DatabaseURL, Origin string
	Port                         string
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
	return Config{Address: net.JoinHostPort(host, port), DatabaseURL: db, Origin: origin, Port: port}, nil
}
func isLoopback(host string) bool { ip := net.ParseIP(host); return ip != nil && ip.IsLoopback() }
