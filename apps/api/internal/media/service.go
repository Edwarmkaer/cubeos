package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/Edwarmkaer/cubeos/apps/api/internal/config"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/devices"
	"github.com/Edwarmkaer/cubeos/apps/api/internal/identity"
	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Photo struct {
	ID                                 string     `json:"id"`
	DeviceID                           string     `json:"deviceId"`
	ContentType                        string     `json:"contentType"`
	Size                               int64      `json:"sizeBytes"`
	Width                              int        `json:"widthPx"`
	Height                             int        `json:"heightPx"`
	SHA256                             string     `json:"sha256"`
	CapturedAt                         *time.Time `json:"capturedAt"`
	ImportedAt                         time.Time  `json:"importedAt"`
	ImportMethod                       string     `json:"importMethod"`
	Status                             string     `json:"status"`
	HasThumbnail                       bool       `json:"hasThumbnail"`
	OriginalKey, ThumbnailKey, Backend string     `json:"-"`
}
type Page struct {
	Items      []Photo `json:"items"`
	NextCursor string  `json:"nextCursor"`
}
type Service struct {
	pool  *pgxpool.Pool
	store objects.ObjectStore
	cfg   config.Config
	slots chan struct{}
}

func Configure(c config.Config) (objects.ObjectStore, error) {
	if c.MediaStorage == "s3" {
		return objects.NewS3(objects.S3Config{Endpoint: c.MediaEndpoint, Region: c.MediaRegion, Bucket: c.MediaBucket, AccessKey: c.MediaAccessKey, SecretKey: c.MediaSecretKey, TempRoot: c.MediaTempRoot})
	}
	return objects.NewLocal(c.MediaLocalRoot)
}
func New(p *pgxpool.Pool, store objects.ObjectStore, c config.Config) *Service {
	return &Service{p, store, c, make(chan struct{}, 1)}
}
func (s *Service) Authorize(ctx context.Context, a Access, device string) error {
	if a.Revalidate != nil {
		if err := a.Revalidate(ctx); err != nil {
			return err
		}
	}
	if !a.Principal.ExpiresAt.IsZero() && !time.Now().Before(a.Principal.ExpiresAt) {
		return identity.ErrUnauthorized
	}
	if a.CredentialID == "" {
		_, err := devices.NewRepository(s.pool).Get(ctx, a.Principal, device)
		return err
	}
	var id string
	err := s.pool.QueryRow(ctx, "SELECT c.id::text FROM media_credentials c JOIN devices d ON d.id=c.device_id WHERE c.id=$1 AND c.device_id=$2 AND c.revoked_at IS NULL AND c.owner_user_id=d.owner_user_id AND d.owner_user_id=$3", a.CredentialID, device, a.Principal.UserID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrCredential
	}
	return err
}

type cancelReader struct {
	ctx context.Context
	r   io.Reader
}

func (r cancelReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.r.Read(p)
}
func (s *Service) Upload(ctx context.Context, a Access, device string, r io.Reader, mime string, captured *time.Time, method string) (Photo, error) {
	var result Photo
	if err := s.Authorize(ctx, a, device); err != nil {
		return result, err
	}
	// No waiting backlog of large in-flight files or decoders per API process.
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return result, ErrLimit
	}
	if err := os.MkdirAll(s.cfg.MediaTempRoot, 0700); err != nil {
		return result, err
	}
	id := uuid.NewString()
	f, err := os.OpenFile(s.cfg.MediaTempRoot+"/stage-"+id, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return result, err
	}
	defer func() { f.Close(); os.Remove(f.Name()) }()
	hash := sha256.New()
	size, err := io.Copy(io.MultiWriter(f, hash), io.LimitReader(cancelReader{ctx, r}, s.cfg.MediaMaxBytes+1))
	if err != nil {
		return result, err
	}
	if size > s.cfg.MediaMaxBytes {
		return result, ErrLimit
	}
	if _, err = f.Seek(0, 0); err != nil {
		return result, err
	}
	dimensions, err := Inspect(f, mime, s.cfg.MediaMaxPixels)
	if err != nil {
		return result, err
	}
	if method != "manual" && method != "http" {
		return result, ErrInvalid
	}
	if captured != nil && (captured.Year() < 1970 || captured.After(time.Now().Add(5*time.Minute))) {
		return result, ErrInvalid
	}
	// Lock spans committed pending metadata and object writes. A crashed process
	// releases it; reconcilers never race a still-running upload on another API.
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return result, err
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,20261010))", id); err != nil {
		return result, err
	}
	defer unlock(conn, id)
	if err = s.Authorize(ctx, a, device); err != nil {
		return result, err
	}
	result = Photo{ID: id, DeviceID: device, ContentType: mime, Size: size, Width: dimensions.Width, Height: dimensions.Height, SHA256: fmt.Sprintf("%x", hash.Sum(nil)), CapturedAt: captured, ImportMethod: method, Status: "pending", OriginalKey: "photos/" + id + "/original", Backend: s.cfg.MediaStorage}
	err = conn.QueryRow(ctx, "INSERT INTO photos(id,device_id,storage_backend,original_key,content_type,size_bytes,width_px,height_px,sha256,captured_at,import_method) SELECT $1,d.id,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM devices d WHERE d.id=$2 AND d.owner_user_id=$12 RETURNING imported_at", id, device, result.Backend, result.OriginalKey, mime, size, result.Width, result.Height, result.SHA256, captured, method, a.Principal.UserID).Scan(&result.ImportedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Photo{}, devices.ErrNotFound
	}
	if err != nil {
		return Photo{}, err
	}
	if _, err = f.Seek(0, 0); err != nil {
		return Photo{}, err
	}
	if err = s.store.Put(ctx, result.OriginalKey, f, mime); err != nil {
		return Photo{}, err
	}
	if err = s.verify(ctx, result); err != nil {
		return Photo{}, err
	}
	// The original becomes ready independently of thumbnail generation. A failed
	// commit leaves pending metadata and recoverable exact bytes, never false ready.
	if err = s.Authorize(ctx, a, device); err != nil {
		return Photo{}, err
	}
	tag, err := conn.Exec(ctx, "UPDATE photos p SET status='ready' FROM devices d WHERE p.id=$1 AND d.id=p.device_id AND d.owner_user_id=$2", id, a.Principal.UserID)
	if err != nil {
		return Photo{}, err
	}
	if tag.RowsAffected() != 1 {
		return Photo{}, devices.ErrNotFound
	}
	result.Status = "ready"
	s.makeThumbnail(ctx, conn, &result, f)
	return result, nil
}
func unlock(conn *pgxpool.Conn, id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_unlock(hashtextextended($1,20261010))", id); err != nil {
		conn.Conn().Close(ctx)
	}
}
func (s *Service) makeThumbnail(ctx context.Context, conn *pgxpool.Conn, p *Photo, r io.ReadSeeker) {
	if _, err := r.Seek(0, 0); err != nil {
		return
	}
	data, err := Thumbnail(r, 320, s.cfg.MediaMaxPixels)
	if err != nil {
		return
	}
	key := "photos/" + p.ID + "/thumbnail"
	if err = s.store.Put(ctx, key, bytes.NewReader(data), "image/jpeg"); err != nil {
		return
	}
	tag, err := conn.Exec(ctx, "UPDATE photos SET thumbnail_key=$2 WHERE id=$1 AND status='ready'", p.ID, key)
	if err == nil && tag.RowsAffected() == 1 {
		p.ThumbnailKey = key
		p.HasThumbnail = true
	}
}
func (s *Service) verify(ctx context.Context, p Photo) error {
	r, err := s.store.Open(ctx, p.OriginalKey)
	if err != nil {
		return err
	}
	defer r.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(cancelReader{ctx, r}, p.Size+1))
	if err != nil {
		return err
	}
	if n != p.Size || fmt.Sprintf("%x", h.Sum(nil)) != p.SHA256 {
		return ErrInvalid
	}
	return nil
}

const columns = "p.id::text,p.device_id::text,p.content_type,p.size_bytes,p.width_px,p.height_px,p.sha256,p.captured_at,p.imported_at,p.import_method,p.status,p.original_key,COALESCE(p.thumbnail_key,''),p.storage_backend"

func scanPhoto(row pgx.Row) (Photo, error) {
	var p Photo
	err := row.Scan(&p.ID, &p.DeviceID, &p.ContentType, &p.Size, &p.Width, &p.Height, &p.SHA256, &p.CapturedAt, &p.ImportedAt, &p.ImportMethod, &p.Status, &p.OriginalKey, &p.ThumbnailKey, &p.Backend)
	if errors.Is(err, pgx.ErrNoRows) {
		err = devices.ErrNotFound
	}
	p.HasThumbnail = p.ThumbnailKey != ""
	return p, err
}
func (s *Service) Get(ctx context.Context, user identity.Principal, id string) (Photo, error) {
	return scanPhoto(s.pool.QueryRow(ctx, "SELECT "+columns+" FROM photos p JOIN devices d ON d.id=p.device_id WHERE p.id=$1 AND d.owner_user_id=$2", id, user.UserID))
}

type cursor struct {
	Device, ID string
	Imported   time.Time
}

func (s *Service) List(ctx context.Context, user identity.Principal, device string, limit int, encoded string) (Page, error) {
	result := Page{Items: []Photo{}}
	if limit < 1 || limit > 100 {
		return result, ErrInvalid
	}
	if _, err := devices.NewRepository(s.pool).Get(ctx, user, device); err != nil {
		return result, err
	}
	var c cursor
	var date any
	var id any
	if encoded != "" {
		if len(encoded) > 512 {
			return result, ErrInvalid
		}
		raw, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil || json.Unmarshal(raw, &c) != nil || c.Device != device || uuid.Validate(c.ID) != nil || c.Imported.IsZero() {
			return result, ErrInvalid
		}
		date = c.Imported
		id = c.ID
	}
	rows, err := s.pool.Query(ctx, "SELECT "+columns+" FROM photos p JOIN devices d ON d.id=p.device_id WHERE p.device_id=$1 AND d.owner_user_id=$2 AND ($3::timestamptz IS NULL OR (p.imported_at,p.id)<($3,$4::uuid)) ORDER BY p.imported_at DESC,p.id DESC LIMIT $5", device, user.UserID, date, id, limit+1)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		p, err := scanPhoto(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, p)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return result, err
	}
	// Release the query connection before object I/O or demotion writes. Missing
	// objects in concurrent pages must not consume the pool and deadlock updates.
	for index := range result.Items {
		p := result.Items[index]
		if p.Status == "ready" && p.Backend == s.cfg.MediaStorage {
			object, e := s.store.Open(ctx, p.OriginalKey)
			if e == nil {
				object.Close()
				if p.HasThumbnail {
					derivative, thumbErr := s.store.Open(ctx, p.ThumbnailKey)
					if thumbErr == nil {
						derivative.Close()
					} else if errors.Is(thumbErr, objects.ErrNotFound) {
						if err = s.clearThumbnail(ctx, p); err != nil {
							return result, err
						}
						p.HasThumbnail = false
						p.ThumbnailKey = ""
					} else {
						return result, thumbErr
					}
				}
			} else {
				if !errors.Is(e, objects.ErrNotFound) {
					return result, e
				}
				p.Status = "pending"
				p.HasThumbnail = false
				if _, err = s.pool.Exec(ctx, "UPDATE photos SET status='pending' WHERE id=$1", p.ID); err != nil {
					return result, err
				}
			}
		}
		if p.Backend != s.cfg.MediaStorage {
			p.Status = "pending"
			p.HasThumbnail = false
		}
		result.Items[index] = p
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	if len(result.Items) > limit {
		result.Items = result.Items[:limit]
		last := result.Items[limit-1]
		raw, _ := json.Marshal(cursor{device, last.ID, last.ImportedAt})
		result.NextCursor = base64.RawURLEncoding.EncodeToString(raw)
	}
	return result, nil
}
func (s *Service) Open(ctx context.Context, user identity.Principal, id string, thumbnail bool) (Photo, io.ReadCloser, error) {
	p, err := s.Get(ctx, user, id)
	if err != nil {
		return p, nil, err
	}
	if p.Status != "ready" || p.Backend != s.cfg.MediaStorage {
		return p, nil, devices.ErrNotFound
	}
	original, err := s.store.Open(ctx, p.OriginalKey)
	if err != nil {
		if errors.Is(err, objects.ErrNotFound) {
			s.pool.Exec(ctx, "UPDATE photos SET status='pending' WHERE id=$1", id)
			return p, nil, devices.ErrNotFound
		}
		return p, nil, err
	}
	if !thumbnail {
		return p, original, nil
	}
	original.Close()
	key := p.OriginalKey
	if thumbnail {
		key = p.ThumbnailKey
		if key == "" {
			return p, nil, devices.ErrNotFound
		}
	}
	r, err := s.store.Open(ctx, key)
	if errors.Is(err, objects.ErrNotFound) {
		if repairErr := s.clearThumbnail(ctx, p); repairErr != nil {
			return p, nil, repairErr
		}
		err = devices.ErrNotFound
	}
	return p, r, err
}

// Only derivative evidence is cleared. The verified original stays ready, and
// comparison with the observed key avoids clearing unrelated metadata.
func (s *Service) clearThumbnail(ctx context.Context, p Photo) error {
	_, err := s.pool.Exec(ctx, "UPDATE photos SET thumbnail_key=NULL WHERE id=$1 AND storage_backend=$2 AND thumbnail_key=$3", p.ID, p.Backend, p.ThumbnailKey)
	return err
}
