#!/usr/bin/env bash
set -euo pipefail
# Own disposable cold-start fixture only. Containers/volumes are retained;
# stop only the unique container created by this invocation.
wait_script=${1:?Pass the readiness implementation to verify}
prefix=${2:-cubeos-pr10-ci-ready}
[[ "$prefix" == cubeos-pr10-ci-ready* ]] || exit 2
fixture="${prefix}-$(date +%s)-$RANDOM"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export PGPASSWORD="$POSTGRES_PASSWORD"
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::add-mask::$POSTGRES_PASSWORD"; fi
port=${TEST_PG_READY_PORT:-55443}
root=$(cd "$(dirname "$0")" && pwd)
docker run -d --name "$fixture" -e POSTGRES_PASSWORD \
  -p "127.0.0.1:$port:5432" -v "$fixture-data:/var/lib/postgresql/data" \
  -v "$root/postgres-slow-init.sql:/docker-entrypoint-initdb.d/slow.sql:ro" \
  postgres:17.6-alpine >/dev/null
trap 'docker stop "$fixture" >/dev/null' EXIT
# The local host has no psql installation. Use the real official client over
# the host's mapped TCP port; this is not a simulated command or server.
psql() { docker run --rm --network host -e PGPASSWORD -e PGCONNECT_TIMEOUT postgres:17.6-alpine psql "$@"; }
createdb() { docker run --rm --network host -e PGPASSWORD -e PGCONNECT_TIMEOUT postgres:17.6-alpine createdb "$@"; }
export -f psql createdb
export TEST_PG_READY_CONTAINER="$fixture"
bash "$wait_script" "$port" 30
PGCONNECT_TIMEOUT=2 psql -h 127.0.0.1 -p "$port" -U postgres -d postgres -XAt -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
createdb -h 127.0.0.1 -p "$port" -U postgres cold_start_gate
psql -h 127.0.0.1 -p "$port" -U postgres -d cold_start_gate -XAt -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
# A failed readiness probe must terminate explicitly instead of falling through
# into createdb. Use the live fixture with deliberately wrong authentication.
if PGPASSWORD=not-the-fixture-password bash "$wait_script" "$port" 2; then
  echo 'Readiness incorrectly accepted failed authentication' >&2
  exit 1
else
  failure=$?
  [[ "$failure" == 1 ]] || { echo "Unexpected readiness failure: $failure" >&2; exit 1; }
fi
if [[ "${CUBEOS_PG_READY_BROWSER:-}" == 1 ]]; then
  export TEST_BROWSER_DATABASE_URL="postgres://postgres:$POSTGRES_PASSWORD@localhost:$port/cold_start_gate?sslmode=disable"
  export CUBEOS_BROWSER_PG_CONTAINER="$fixture"
  node --experimental-strip-types apps/web/tests/browser-integration.mjs
fi
echo "Cold-start mapped TCP/query/database gate passed: $fixture"
