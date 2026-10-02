#!/usr/bin/env bash
set -euo pipefail
# PGDATABASE contains private connection config, inherited rather than expanded
# into argv. Dump/restore streams pass through stdin/stdout, never host filenames.
tool=$(basename "$0")
case "$tool" in pg_dump|pg_restore) ;; *) exit 2;; esac
exec docker run --rm -i --network host -e PGDATABASE -e PGCONNECT_TIMEOUT \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGSSLMODE \
  postgres:17.6-alpine "$tool" "$@"
