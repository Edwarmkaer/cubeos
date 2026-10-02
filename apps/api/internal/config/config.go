package config

import (
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	"net"
	"net/url"
	"strconv"
)

type Config struct {
	RailwayHealthcheck                                                      bool
	Mode, PublicAPIHost                                                     string
	ClerkIssuer, ClerkJWKSURL, ClerkAudience, ClerkSecretKey                string
	Address, DatabaseURL, Origin                                            string
	Port                                                                    string
	IngestionAddress, SerialPort, SerialSourceID                            string
	SerialBaud                                                              int
	MediaStorage, MediaLocalRoot, MediaTempRoot                             string
	MediaEndpoint, MediaRegion, MediaBucket, MediaAccessKey, MediaSecretKey string
	MediaMaxBytes, MediaMaxPixels                                           int64
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
	if (mode == "local" && auth != "local") || (mode == "public" && auth != "clerk") {
		return Config{}, errors.New("authentication must match deployment mode")
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
	if mode == "local" && (ip == nil || !ip.IsLoopback()) && !(container == "true" && host == "0.0.0.0") {
		return Config{}, errors.New("local listener must be loopback or explicit isolated container")
	}
	origin := value("ALLOWED_ORIGIN", "http://localhost:3000")
	o, err := url.Parse(origin)
	if mode == "local" && (err != nil || o.Scheme != "http" || o.User != nil || o.Path != "" || o.RawQuery != "" || o.Fragment != "" || (o.Hostname() != "localhost" && !isLoopback(o.Hostname())) || o.Port() == "") {
		return Config{}, errors.New("allowed origin must be a local http origin with explicit port")
	}
	db := get("DATABASE_URL")
	u, err := url.Parse(db)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" {
		return Config{}, errors.New("DATABASE_URL must be a PostgreSQL connection URL")
	}
	c := Config{Address: net.JoinHostPort(host, port), DatabaseURL: db, Origin: origin, Port: port, IngestionAddress: get("INGESTION_ADDRESS"), SerialPort: get("SERIAL_PORT"), SerialSourceID: get("SERIAL_SOURCE_ID")}
	c.Mode = mode
	if v := get("RAILWAY_HEALTHCHECK"); v != "" {
		if (v != "true" && v != "false") || (v == "true" && mode != "public") {
			return Config{}, errors.New("Railway healthcheck requires explicit public mode")
		}
		c.RailwayHealthcheck = v == "true"
	}
	if mode == "public" {
		c.PublicAPIHost = get("PUBLIC_API_HOST")
		c.ClerkIssuer = get("CLERK_ISSUER")
		c.ClerkJWKSURL = get("CLERK_JWKS_URL")
		c.ClerkAudience = get("CLERK_AUDIENCE")
		c.ClerkSecretKey = get("CLERK_SECRET_KEY")
		issuer, e := url.Parse(c.ClerkIssuer)
		jwks, e2 := url.Parse(c.ClerkJWKSURL)
		public, e3 := url.Parse("https://" + c.PublicAPIHost)
		if err != nil || !httpsOrigin(o) || e != nil || !httpsOrigin(issuer) || e2 != nil || jwks.Scheme != "https" || jwks.Host != issuer.Host || jwks.User != nil || jwks.Path != "/.well-known/jwks.json" || jwks.RawQuery != "" || jwks.Fragment != "" || e3 != nil || !httpsOrigin(public) || c.PublicAPIHost == "" || c.ClerkAudience == "" || len(c.ClerkAudience) > 256 || c.ClerkSecretKey == "" || c.SerialPort != "" || c.SerialSourceID != "" || get("SERIAL_BAUD") != "" || container == "true" {
			return Config{}, errors.New("public deployment requires HTTPS origins, trusted Clerk issuer/JWKS, audience, secret and public API host; no local serial/profile")
		}
	}
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
	c.MediaStorage = value("MEDIA_STORAGE", "local")
	c.MediaLocalRoot = value("MEDIA_LOCAL_ROOT", "./data/media")
	c.MediaTempRoot = value("MEDIA_TEMP_ROOT", "./data/media-staging")
	c.MediaMaxBytes, err = strconv.ParseInt(value("MEDIA_MAX_BYTES", "67108864"), 10, 64)
	if err != nil || c.MediaMaxBytes < 1 || c.MediaMaxBytes > 256<<20 {
		return Config{}, errors.New("invalid media byte limit")
	}
	c.MediaMaxPixels, err = strconv.ParseInt(value("MEDIA_MAX_PIXELS", "80000000"), 10, 64)
	if err != nil || c.MediaMaxPixels < 1 || c.MediaMaxPixels > 80_000_000 {
		return Config{}, errors.New("invalid media pixel limit")
	}
	if c.MediaStorage != "local" && c.MediaStorage != "s3" {
		return Config{}, errors.New("invalid media storage")
	}
	if c.Mode == "public" && c.MediaStorage != "s3" {
		return Config{}, errors.New("public media requires persistent S3 storage")
	}
	if c.MediaStorage == "s3" {
		c.MediaEndpoint = get("MEDIA_S3_ENDPOINT")
		c.MediaRegion = get("MEDIA_S3_REGION")
		c.MediaBucket = get("MEDIA_S3_BUCKET")
		c.MediaAccessKey = get("MEDIA_S3_ACCESS_KEY")
		c.MediaSecretKey = get("MEDIA_S3_SECRET_KEY")
		endpoint, e := url.Parse(c.MediaEndpoint)
		if e != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.Path != "" || endpoint.RawQuery != "" || endpoint.Fragment != "" || (endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && isLoopback(endpoint.Hostname()))) || c.MediaRegion == "" || c.MediaBucket == "" || c.MediaAccessKey == "" || c.MediaSecretKey == "" {
			return Config{}, errors.New("complete private S3 configuration required; plaintext only on loopback")
		}
	}
	return c, nil
}
func isLoopback(host string) bool { ip := net.ParseIP(host); return ip != nil && ip.IsLoopback() }
func httpsOrigin(u *url.URL) bool {
	return u != nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.Path == "" && u.RawQuery == "" && u.Fragment == ""
}
