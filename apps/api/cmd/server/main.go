package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	api "github.com/Edwarmkaer/cubeos/apps/api/internal/http"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/ingestion"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/realtime"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/storage"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.bug.st/serial"
	"io"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
func run() error {
	c, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	pc, err := pgxpool.ParseConfig(c.DatabaseURL)
	if err != nil {
		return errors.New("invalid database configuration")
	}
	pc.ConnConfig.ConnectTimeout = 3 * time.Second
	pc.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return errors.New("could not configure database")
	}
	defer pool.Close()
	if len(os.Args) > 1 {
		if len(os.Args) == 4 && os.Args[1] == "enroll" {
			if c.Mode != "public" {
				return errors.New("enrollment requires public mode")
			}
			enrollCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			if _, e := identity.Enroll(enrollCtx, pool, os.Args[2], os.Args[3]); e != nil {
				return errors.New("enrollment failed; check subject, display name and migrations")
			}
			log.Print("public identity enrolled")
			return nil
		}
		if c.Mode == "public" && os.Args[1] != "migrate" {
			return errors.New("local fixture/rebuild commands are disabled in public mode")
		}
		if len(os.Args) == 2 && os.Args[1] == "fixture" {
			return fixture(ctx, pool, os.Stdin, os.Stdout)
		}
		if len(os.Args) == 3 && os.Args[1] == "rebuild" {
			principal, e := identity.Local(ctx, pool)
			if e != nil {
				return errors.New("local profile unavailable")
			}
			if e = telemetry.NewRepository(pool).Rebuild(ctx, principal, os.Args[2]); e != nil {
				return errors.New("rebuild failed; check ownership, database and evidence")
			}
			return nil
		}
		if len(os.Args) != 2 || os.Args[1] != "migrate" {
			return errors.New("usage: server [migrate | fixture | rebuild DEVICE_UUID]")
		}
		migrationCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		if err = storage.Migrate(migrationCtx, pool); err != nil {
			return errors.New("migration failed; check database availability and migration versions")
		}
		if c.Mode == "local" {
			if _, err = identity.Local(migrationCtx, pool); err != nil {
				return errors.New("local profile initialization failed")
			}
		}
		log.Print("migrations ready")
		return nil
	}
	resolver := func(ctx context.Context, r *http.Request) (identity.Principal, error) {
		// The offline profile has no bearer credential. Ingestion secrets cannot
		// be promoted into user access to REST or SSE by this local resolver.
		if r.Header.Get("Authorization") != "" {
			return identity.Principal{}, nil
		}
		return identity.Local(ctx, pool)
	}
	if c.Mode == "public" {
		resolver = identity.NewClerk(pool, c.ClerkIssuer, c.ClerkJWKSURL, c.ClerkAudience, c.Origin, c.ClerkSecretKey).Resolve
	}
	hub := realtime.NewHub()
	go hub.Run(ctx, c.DatabaseURL)
	defer hub.Close()
	server := &http.Server{Addr: c.Address, Handler: api.NewWithRealtime(c, pool, devices.NewRepository(pool), telemetry.NewRepository(pool), resolver, hub), BaseContext: func(net.Listener) context.Context { return ctx }, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	service := ingestion.NewService(ingestion.NewRepository(pool))
	sources := ingestion.NewSources(pool)
	var ingress *http.Server
	if c.SerialPort != "" {
		startup, cancel := context.WithTimeout(ctx, ingestion.TransportOperationTimeout)
		principal, e := identity.Local(startup, pool)
		if e != nil {
			cancel()
			return errors.New("serial local identity unavailable")
		}
		_, e = sources.ActiveSerial(startup, principal, c.SerialSourceID)
		cancel()
		if e != nil {
			return errors.New("serial source must be active and owned by local profile")
		}
		go func() {
			e := ingestion.RunSerial(ctx, func() (io.ReadCloser, error) {
				if _, e := sources.ActiveSerial(ctx, principal, c.SerialSourceID); e != nil {
					return nil, e
				}
				port, e := serial.Open(c.SerialPort, &serial.Mode{BaudRate: c.SerialBaud, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit})
				if e != nil {
					return nil, e
				}
				if e = port.SetReadTimeout(250 * time.Millisecond); e != nil {
					port.Close()
					return nil, e
				}
				return port, nil
			}, service, c.SerialSourceID, time.Second)
			if e != nil && !errors.Is(e, context.Canceled) {
				log.Print("serial adapter stopped")
			}
		}()
	}
	if c.IngestionAddress != "" {
		ingress = &http.Server{Addr: c.IngestionAddress, Handler: ingestion.RestrictedHTTP(c.IngestionAddress, ingestion.NewHTTP(service, sources)), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
		listener, e := net.Listen("tcp", c.IngestionAddress)
		if e != nil {
			return errors.New("ingestion listener cannot bind; refusing startup")
		}
		defer listener.Close()
		go func() {
			if e := ingress.Serve(listener); e != nil && !errors.Is(e, http.ErrServerClosed) {
				log.Print("ingestion listener failed")
				stop()
			}
		}()
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		if ingress != nil {
			_ = ingress.Shutdown(shutdownCtx)
		}
	}()
	log.Printf("%s API listening on %s", c.Mode, c.Address)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
