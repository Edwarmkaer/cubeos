// Package recovery implements a quiesced, private DB+objects archive. It never
// creates or drops databases/buckets and refuses occupied restore destinations.
package recovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	objects "github.com/Edwarmkaer/cubeos/apps/api/internal/media/storage"
	"github.com/jackc/pgx/v5"
)

type Inventory interface {
	objects.ObjectStore
	Keys(context.Context) ([]string, error)
}
type Entry struct {
	Key    string `json:"key"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}
type Manifest struct {
	Version   int       `json:"version"`
	Backend   string    `json:"backend"`
	CreatedAt time.Time `json:"createdAt"`
	Database  Entry     `json:"database"`
	Objects   []Entry   `json:"objects"`
}

var objectKey = regexp.MustCompile(`^photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(original|thumbnail)$`)
var databaseName = regexp.MustCompile(`^cubeos_restore_[0-9a-f]{32}$`)
var storeName = regexp.MustCompile(`^cubeos-restore-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var hash = regexp.MustCompile(`^[0-9a-f]{64}$`)
var refusal = errors.New("recovery refused; check quiescence, explicit empty disposable target, archive integrity and private storage")

// Only report a fixed diagnostic: PostgreSQL and S3 errors may contain secrets
// or private row data. PGDATABASE is inherited, never a process argument.
func pgTool(ctx context.Context, name, db string, input io.Reader, output io.Writer, args ...string) error {
	pc, err := pgx.ParseConfig(db)
	u, e := url.Parse(db)
	if err != nil || e != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return refusal
	}
	cmd := exec.CommandContext(ctx, name, args...)
	// libpq options are fixed rather than inherited from an operator's environment.
	sslmode := u.Query().Get("sslmode")
	if sslmode == "" {
		sslmode = "prefer"
	}
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "PGDATABASE=" + pc.Database, "PGHOST=" + pc.Host, "PGPORT=" + strconv.Itoa(int(pc.Port)), "PGUSER=" + pc.User, "PGPASSWORD=" + pc.Password, "PGSSLMODE=" + sslmode, "PGCONNECT_TIMEOUT=5", "HOME=" + os.Getenv("HOME")}
	for key, env := range map[string]string{"sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY"} {
		if v := u.Query().Get(key); v != "" {
			cmd.Env = append(cmd.Env, env+"="+v)
		}
	}
	cmd.Stdin = input
	cmd.Stdout = output
	cmd.Stderr = io.Discard
	if cmd.Run() != nil {
		return refusal
	}
	return nil
}
func digest(r io.Reader, limit int64) (Entry, error) {
	h := sha256.New()
	n, e := io.Copy(h, io.LimitReader(r, limit+1))
	if e != nil || n > limit {
		return Entry{}, refusal
	}
	return Entry{SHA256: hex.EncodeToString(h.Sum(nil)), Size: n}, nil
}
func archiveEntry(root *os.Root, name string, limit int64) (Entry, error) {
	// OpenRoot bounds paths; disallow links even when they point within the archive.
	info, e := root.Lstat(name)
	if e != nil || !info.Mode().IsRegular() {
		return Entry{}, refusal
	}
	f, e := root.Open(name)
	if e != nil {
		return Entry{}, refusal
	}
	defer f.Close()
	return digest(f, limit)
}
func exclusive(ctx context.Context, db string) (*pgx.Conn, error) {
	if !explicitDatabase(db) {
		return nil, refusal
	}
	pc, e := pgx.ParseConfig(db)
	if e != nil {
		return nil, refusal
	}
	pc.ConnectTimeout = 5 * time.Second
	c, e := pgx.ConnectConfig(ctx, pc)
	if e != nil {
		return nil, refusal
	}
	var locked bool
	e = c.QueryRow(ctx, "SELECT pg_try_advisory_lock(2026100211)").Scan(&locked)
	var others int
	if e == nil && locked {
		e = c.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'").Scan(&others)
	}
	if e != nil || !locked || others != 0 {
		c.Close(ctx)
		return nil, refusal
	}
	return c, nil
}

func explicitDatabase(db string) bool {
	u, e := url.Parse(db)
	return e == nil && (u.Scheme == "postgres" || u.Scheme == "postgresql") && u.Host != "" && u.User != nil && u.User.Username() != "" && u.Path != "" && u.Path != "/" && u.Fragment == ""
}

// ValidateTarget runs before opening/creating local directories. The recovery
// CLI cannot inherit an application target or create files at a dangerous path.
func ValidateTarget(db, backend, target string) error {
	if !explicitDatabase(db) {
		return refusal
	}
	pc, e := pgx.ParseConfig(db)
	if e != nil || !databaseName.MatchString(pc.Database) {
		return refusal
	}
	if backend == "local" {
		if !filepath.IsAbs(target) || !storeName.MatchString(filepath.Base(target)) {
			return refusal
		}
		parent := filepath.Dir(target)
		resolved, e := filepath.EvalSymlinks(parent)
		if e != nil || resolved != filepath.Clean(parent) {
			return refusal
		}
		if info, e := os.Lstat(target); e == nil && !info.IsDir() || e != nil && !errors.Is(e, os.ErrNotExist) {
			return refusal
		}
	} else if backend != "s3" || !storeName.MatchString(target) {
		return refusal
	}
	return nil
}

func Backup(ctx context.Context, db string, s Inventory, backend, directory string, stopped bool) error {
	if !stopped || (backend != "local" && backend != "s3") || !filepath.IsAbs(directory) {
		return refusal
	}
	c, e := exclusive(ctx, db)
	if e != nil {
		return e
	}
	defer c.Close(ctx)
	tx, e := c.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if e != nil {
		return refusal
	}
	defer tx.Rollback(ctx)
	// Stop applications first. NOWAIT catches an in-flight writer rather than
	// accepting an acknowledgement while its transaction is still active.
	rows, e := tx.Query(ctx, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
	if e != nil {
		return refusal
	}
	var tables []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) != nil {
			rows.Close()
			return refusal
		}
		tables = append(tables, pgx.Identifier{"public", name}.Sanitize())
	}
	rows.Close()
	if rows.Err() != nil || len(tables) == 0 {
		return refusal
	}
	if _, e = tx.Exec(ctx, "LOCK TABLE "+strings.Join(tables, ",")+" IN SHARE MODE NOWAIT"); e != nil {
		return refusal
	}
	var snapshot string
	if e = tx.QueryRow(ctx, "SELECT pg_export_snapshot()").Scan(&snapshot); e != nil {
		return refusal
	}
	// A mixed backend cannot be recovered from one selected installation store.
	var foreign int
	if e = tx.QueryRow(ctx, "SELECT count(*) FROM photos WHERE storage_backend<>$1", backend).Scan(&foreign); e != nil || foreign != 0 {
		return refusal
	}
	keys, e := s.Keys(ctx)
	if e != nil {
		return refusal
	}
	sort.Strings(keys)
	present := map[string]bool{}
	for _, k := range keys {
		if !objectKey.MatchString(k) || present[k] {
			return refusal
		}
		present[k] = true
	}
	rows, e = tx.Query(ctx, "SELECT original_key,coalesce(thumbnail_key,''),size_bytes,sha256,status FROM photos")
	if e != nil {
		return refusal
	}
	expected := map[string]Entry{}
	for rows.Next() {
		var k, thumb, sha, status string
		var size int64
		if rows.Scan(&k, &thumb, &size, &sha, &status) != nil {
			rows.Close()
			return refusal
		}
		if !objectKey.MatchString(k) || !hash.MatchString(sha) || size < 1 || size > objects.MaxObjectBytes {
			rows.Close()
			return refusal
		}
		if status == "ready" && !present[k] || thumb != "" && !present[thumb] {
			rows.Close()
			return refusal
		}
		expected[k] = Entry{SHA256: sha, Size: size}
	}
	rows.Close()
	if rows.Err() != nil {
		return refusal
	}
	// Exclusive creation prevents a failed/archive retry from overwriting evidence.
	if os.Mkdir(directory, 0700) != nil {
		return refusal
	}
	complete := false
	defer func() {
		if !complete {
			os.WriteFile(filepath.Join(directory, "INCOMPLETE"), []byte("retry into a new archive directory\n"), 0600)
		}
	}()
	root, e := os.OpenRoot(directory)
	if e != nil {
		return refusal
	}
	defer root.Close()
	dump, e := root.OpenFile("database.dump", os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if e != nil {
		return refusal
	}
	e = pgTool(ctx, "pg_dump", db, nil, dump, "--format=custom", "--no-owner", "--no-privileges", "--snapshot="+snapshot)
	if e == nil {
		e = dump.Sync()
	}
	dump.Close()
	if e != nil {
		return refusal
	}
	dbEntry, e := archiveEntry(root, "database.dump", 1<<50)
	if e != nil {
		return e
	}
	dbEntry.Key = "database.dump"
	m := Manifest{Version: 1, Backend: backend, CreatedAt: time.Now().UTC(), Database: dbEntry, Objects: []Entry{}}
	for _, k := range keys {
		if root.MkdirAll(filepath.Dir("objects/"+k), 0700) != nil {
			return refusal
		}
		f, e := root.OpenFile("objects/"+k, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
		if e != nil {
			return refusal
		}
		r, e := s.Open(ctx, k)
		if e != nil {
			f.Close()
			return refusal
		}
		h := sha256.New()
		n, e := io.Copy(io.MultiWriter(f, h), io.LimitReader(r, objects.MaxObjectBytes+1))
		r.Close()
		if e == nil {
			e = f.Sync()
		}
		f.Close()
		if e != nil || n > objects.MaxObjectBytes {
			return refusal
		}
		entry := Entry{Key: k, SHA256: hex.EncodeToString(h.Sum(nil)), Size: n}
		if want, ok := expected[k]; ok && (want.Size != n || want.SHA256 != entry.SHA256) {
			return refusal
		}
		m.Objects = append(m.Objects, entry)
	}
	// No omission of referenced ready bytes and no mutation during the window.
	again, e := s.Keys(ctx)
	if e != nil {
		return refusal
	}
	sort.Strings(again)
	if strings.Join(keys, "\n") != strings.Join(again, "\n") {
		return refusal
	}
	for _, entry := range m.Objects {
		r, e := s.Open(ctx, entry.Key)
		if e != nil {
			return refusal
		}
		got, e := digest(r, objects.MaxObjectBytes)
		r.Close()
		if e != nil || got.Size != entry.Size || got.SHA256 != entry.SHA256 {
			return refusal
		}
	}
	if e = tx.Commit(ctx); e != nil {
		return refusal
	}
	raw, e := json.MarshalIndent(m, "", "  ")
	if e != nil {
		return refusal
	}
	f, e := root.OpenFile("manifest.json", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return refusal
	}
	_, e = f.Write(raw)
	if e == nil {
		e = f.Sync()
	}
	f.Close()
	if e != nil {
		return refusal
	}
	dir, e := root.Open(".")
	if e != nil {
		return refusal
	}
	e = dir.Sync()
	dir.Close()
	if e != nil {
		return refusal
	}
	complete = true
	return nil
}

func Restore(ctx context.Context, db string, s Inventory, backend, target, directory string, disposable bool) error {
	if !disposable || !filepath.IsAbs(directory) || (backend != "local" && backend != "s3") {
		return refusal
	}
	if ValidateTarget(db, backend, target) != nil {
		return refusal
	}
	c, e := exclusive(ctx, db)
	if e != nil {
		return e
	}
	defer c.Close(ctx)
	// Non-public schemas, extensions, relations, functions or types also count as
	// occupied. No --clean, DROP, CREATE DATABASE or credential/schema overwrite.
	var count int
	e = c.QueryRow(ctx, `SELECT (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%') + (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')`).Scan(&count)
	if e != nil || count != 0 {
		return refusal
	}
	keys, e := s.Keys(ctx)
	if e != nil || len(keys) != 0 {
		return refusal
	}
	root, e := os.OpenRoot(directory)
	if e != nil {
		return refusal
	}
	defer root.Close()
	if _, e = root.Lstat("INCOMPLETE"); !errors.Is(e, os.ErrNotExist) {
		return refusal
	}
	f, e := root.Open("manifest.json")
	if e != nil {
		return refusal
	}
	decoder := json.NewDecoder(io.LimitReader(f, 32<<20))
	decoder.DisallowUnknownFields()
	var m Manifest
	e = decoder.Decode(&m)
	var extra any
	end := decoder.Decode(&extra)
	f.Close()
	if e != nil || end != io.EOF || m.Version != 1 || m.Backend != backend || m.Database.Key != "database.dump" || !hash.MatchString(m.Database.SHA256) || m.Database.Size <= 0 || len(m.Objects) > 100000 {
		return refusal
	}
	check := func(name string, want Entry, limit int64) error {
		got, e := archiveEntry(root, name, limit)
		if e != nil || got.Size != want.Size || got.SHA256 != want.SHA256 {
			return refusal
		}
		return nil
	}
	if check("database.dump", m.Database, 1<<50) != nil {
		return refusal
	}
	seen := map[string]bool{}
	for _, entry := range m.Objects {
		if !objectKey.MatchString(entry.Key) || seen[entry.Key] || !hash.MatchString(entry.SHA256) || entry.Size < 1 || entry.Size > objects.MaxObjectBytes {
			return refusal
		}
		seen[entry.Key] = true
		if check("objects/"+entry.Key, entry, objects.MaxObjectBytes) != nil {
			return refusal
		}
	}
	// Objects first, verified after PUT; DB last in one PostgreSQL transaction.
	// On ordinary failure only this invocation's objects in the empty destination
	// are removed. A crash leaves a nonempty target, which is refused on retry.
	var written []string
	committed := false
	defer func() {
		if !committed {
			cleanup, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			for _, k := range written {
				_ = s.Delete(cleanup, k)
			}
		}
	}()
	for _, entry := range m.Objects {
		f, e := root.Open("objects/" + entry.Key)
		if e != nil {
			return refusal
		}
		mime := "image/jpeg"
		if strings.HasSuffix(entry.Key, "/original") {
			mime = "application/octet-stream"
		}
		written = append(written, entry.Key)
		e = s.Put(ctx, entry.Key, f, mime)
		f.Close()
		if e != nil {
			return refusal
		}
		r, e := s.Open(ctx, entry.Key)
		if e != nil {
			return refusal
		}
		got, e := digest(r, objects.MaxObjectBytes)
		r.Close()
		if e != nil || got.Size != entry.Size || got.SHA256 != entry.SHA256 {
			return refusal
		}
	}
	f, e = root.Open("database.dump")
	if e != nil {
		return refusal
	}
	defer f.Close()
	if e = restoreDatabase(ctx, db, f, backend, m.Objects); e != nil {
		return refusal
	}
	committed = true
	return nil
}

// psql owns one transaction covering both the restored SQL and validation of
// photos against the verified object inventory. pg_restore renders the trusted
// dump first; no target DB commit can occur before the final validation succeeds.
func restoreDatabase(ctx context.Context, db string, dump io.Reader, backend string, entries []Entry) error {
	sql, e := os.CreateTemp("", "cubeos-restore-*.sql")
	if e != nil {
		return refusal
	}
	defer os.Remove(sql.Name())
	defer sql.Close()
	if pgTool(ctx, "pg_restore", db, dump, sql, "--file=-", "--no-owner", "--no-privileges") != nil {
		return refusal
	}
	raw, e := json.Marshal(entries)
	if e != nil {
		return refusal
	}
	// All entry keys/hashes and backend are already validated; quote JSON as a
	// SQL literal as well. A NULL thumbnail is pending and needs no object. An
	// absent original is allowed only for a pending photo; present ones must match.
	inventory := "'" + strings.ReplaceAll(string(raw), "'", "''") + "'::jsonb"
	validation := `
DO $cubeos_restore_validation$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.photos p
  LEFT JOIN jsonb_to_recordset(` + inventory + `) AS original(key text, sha256 text, size bigint) ON original.key=p.original_key
  LEFT JOIN jsonb_to_recordset(` + inventory + `) AS thumbnail(key text, sha256 text, size bigint) ON thumbnail.key=p.thumbnail_key
  WHERE p.storage_backend<>'` + backend + `'
   OR (p.status='ready' AND original.key IS NULL)
   OR (original.key IS NOT NULL AND (p.size_bytes<>original.size OR p.sha256<>original.sha256))
   OR (p.thumbnail_key IS NOT NULL AND thumbnail.key IS NULL)
 ) THEN RAISE EXCEPTION 'recovery refused'; END IF;
END
$cubeos_restore_validation$;
`
	if _, e = sql.WriteString(validation); e != nil {
		return refusal
	}
	if _, e = sql.Seek(0, io.SeekStart); e != nil {
		return refusal
	}
	return pgTool(ctx, "psql", db, sql, io.Discard, "--no-psqlrc", "--single-transaction", "--set=ON_ERROR_STOP=1", "--file=-")
}
