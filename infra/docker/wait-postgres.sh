#!/usr/bin/env bash
set -euo pipefail
port=${1:?Pass the mapped loopback PostgreSQL port}
max_wait=${2:-60}
[[ "$port" =~ ^[0-9]+$ && "$max_wait" =~ ^[0-9]+$ ]] || exit 2
(( port >= 1 && port <= 65535 && max_wait >= 1 && max_wait <= 300 )) || exit 2
: "${PGPASSWORD:?Set the disposable PostgreSQL password}"
command -v psql >/dev/null || { echo 'PostgreSQL client psql is required' >&2; exit 1; }
# The official image has a socket-only temporary initialization server. Require
# an authenticated query through the mapped TCP port used by the actual tests.
deadline=$((SECONDS + max_wait))
while (( SECONDS < deadline )); do
  if value=$(PGCONNECT_TIMEOUT=2 psql -h 127.0.0.1 -p "$port" -U postgres -d postgres \
      -XAt -v ON_ERROR_STOP=1 -c 'SELECT 1' 2>/dev/null) && [[ "$value" == 1 ]]; then
    exit 0
  fi
  sleep 1
done
echo "PostgreSQL mapped TCP/query readiness timed out after ${max_wait}s" >&2
exit 1
