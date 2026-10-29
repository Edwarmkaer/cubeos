// Package cloudrelay publishes only the latest committed local projection.
// It owns no ingestion transaction and retains no telemetry backlog.
package cloudrelay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/telemetry"
)

var ErrUnauthorized = errors.New("cloud access expired or revoked; provision a new channel")
var ErrStale = errors.New("cloud revision conflict; provision a new channel")
var errRetry = errors.New("cloud unavailable")

type Replica struct {
	ReplicaVersion   int                            `json:"replicaVersion"`
	ChannelID        string                         `json:"channelId"`
	DeviceID         string                         `json:"deviceId"`
	RevisionID       string                         `json:"revisionId"`
	Snapshot         json.RawMessage                `json:"snapshot"`
	FreshnessByGroup map[string]telemetry.Freshness `json:"freshnessByGroup"`
}
type Reader interface {
	Latest(context.Context) (Replica, error)
}
type Publisher interface {
	Publish(context.Context, Replica) error
}
type Options struct {
	ChannelID, DeviceID string
	ExpiresAt           time.Time
	Enabled             func() bool
}
type httpPublisher struct {
	endpoint, token string
	client          *http.Client
}

func newHTTPPublisher(endpoint, token string) *httpPublisher {
	return &httpPublisher{endpoint, token, &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (p *httpPublisher) Publish(ctx context.Context, r Replica) error {
	body, err := json.Marshal(r)
	if err != nil || len(body) > 64<<10 {
		return errors.New("invalid cloud replica size")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(body))
	if err != nil {
		return errRetry
	}
	req.Header.Set("Authorization", "Bearer "+p.token)
	req.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errRetry
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 512))
	switch response.StatusCode {
	case 200:
		return nil
	case 401, 403:
		return ErrUnauthorized
	case 409:
		return ErrStale
	default:
		return errRetry
	}
}
func pause(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// Run has at most one in-flight snapshot. After any failure it reads the latest
// projection again instead of replaying intermediate revisions.
func Run(ctx context.Context, reader Reader, publisher Publisher, options Options) error {
	var acknowledged int64
	var lastAttempt time.Time
	backoff := time.Second
	for {
		if options.Enabled != nil && !options.Enabled() {
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if !options.ExpiresAt.IsZero() && !time.Now().Before(options.ExpiresAt) {
			return ErrUnauthorized
		}
		if wait := time.Until(lastAttempt.Add(time.Second)); wait > 0 {
			if err := pause(ctx, wait); err != nil {
				return err
			}
		}
		replica, err := reader.Latest(ctx)
		if err != nil {
			if err = pause(ctx, backoff); err != nil {
				return err
			}
			continue
		}
		revision, err := strconv.ParseInt(replica.RevisionID, 10, 64)
		if err != nil || revision < 1 {
			return errors.New("invalid local cloud revision")
		}
		if revision < acknowledged {
			return ErrStale
		}
		if revision == acknowledged {
			if err = pause(ctx, time.Second); err != nil {
				return err
			}
			continue
		}
		replica.ReplicaVersion = 1
		replica.ChannelID = options.ChannelID
		replica.DeviceID = options.DeviceID
		if options.Enabled != nil && !options.Enabled() {
			return nil
		}
		if !options.ExpiresAt.IsZero() && !time.Now().Before(options.ExpiresAt) {
			return ErrUnauthorized
		}
		lastAttempt = time.Now()
		err = publisher.Publish(ctx, replica)
		if errors.Is(err, ErrUnauthorized) || errors.Is(err, ErrStale) {
			return err
		}
		if err != nil {
			if err = pause(ctx, backoff); err != nil {
				return err
			}
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			continue
		}
		acknowledged = revision
		backoff = time.Second
	}
}
