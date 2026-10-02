#!/usr/bin/env bash
set -euo pipefail
# This gate creates only uniquely named disposable fixtures. It never connects
# to an application's DATABASE_URL or a production bucket, nor deletes volumes.
root=$(pwd)
scratch=${CUBEOS_RECOVERY_SCRATCH:-${RUNNER_TEMP:?Set CUBEOS_RECOVERY_SCRATCH outside tmpfs}/cubeos-recovery}
mkdir -p "$scratch"
chmod 700 "$scratch"
export TMPDIR="$scratch/tmp"
mkdir -p "$TMPDIR" "$scratch/bin" "$scratch/archives"
suffix="$(date +%s)-$RANDOM"
pg="cubeos-recovery-pg-$suffix"
s3="cubeos-recovery-s3-$suffix"
pgport=${RECOVERY_PG_PORT:-55471}
s3port=${RECOVERY_S3_PORT:-59071}
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export RUSTFS_ACCESS_KEY="recovery$(openssl rand -hex 8)"
export RUSTFS_SECRET_KEY="$(openssl rand -hex 32)"
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
  echo "::add-mask::$POSTGRES_PASSWORD"
  echo "::add-mask::$RUSTFS_ACCESS_KEY"
  echo "::add-mask::$RUSTFS_SECRET_KEY"
fi
docker run -d --name "$pg" -e POSTGRES_PASSWORD -p "127.0.0.1:$pgport:5432" -v "$pg-data:/var/lib/postgresql/data" postgres:17.6-alpine >/dev/null
trap 'docker stop "$pg" "$s3" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$s3" -e RUSTFS_ACCESS_KEY -e RUSTFS_SECRET_KEY -e RUSTFS_CONSOLE_ENABLE=false -p "127.0.0.1:$s3port:9000" -v "$s3-data:/data" rustfs/rustfs:1.0.0-rc.6-glibc@sha256:b73a77ef70000722d985193e644d30882c57d7cb8f64c06bd329eb7969b03d52 /data >/dev/null
export PGPASSWORD="$POSTGRES_PASSWORD"
psql() { docker run --rm --network host -e PGPASSWORD -e PGCONNECT_TIMEOUT postgres:17.6-alpine psql "$@"; }
export -f psql
bash infra/docker/wait-postgres.sh "$pgport"
for db in railway_test railway_proxy_test railway_container; do docker exec "$pg" createdb -U postgres "$db"; done
for tool in pg_dump pg_restore; do cp infra/recovery/tests/pg-client.sh "$scratch/bin/$tool"; chmod +x "$scratch/bin/$tool"; done
export PATH="$scratch/bin:$PATH"
export TEST_RECOVERY_DATABASE_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:$pgport/postgres?sslmode=disable"
export TEST_RAILWAY_DATABASE_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:$pgport/railway_test?sslmode=disable"
export TEST_RAILWAY_PROXY_DATABASE_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:$pgport/railway_proxy_test?sslmode=disable"
export TEST_S3_ENDPOINT="http://127.0.0.1:$s3port"
export TEST_S3_ACCESS_KEY="$RUSTFS_ACCESS_KEY" TEST_S3_SECRET_KEY="$RUSTFS_SECRET_KEY"
export CUBEOS_RECOVERY_EVIDENCE_DIR="$scratch/archives" RECOVERY_REQUIRED=1
for i in $(seq 1 60); do if curl -fsS "$TEST_S3_ENDPOINT/health" >/dev/null 2>&1; then break; fi; sleep 1; done
curl -fsS "$TEST_S3_ENDPOINT/health" >/dev/null
(cd apps/api; go test -race -count=1 -v ./internal/recovery ./cmd/recovery ./internal/http -run 'Test(Recovery|Railway)')
docker build -f infra/docker/Dockerfile.api -t cubeos-recovery-api:gate .
docker build -f infra/docker/Dockerfile.web -t cubeos-recovery-web:gate .
docker build -f infra/recovery/Dockerfile -t cubeos-recovery-tool:gate .
export RECOVERY_GATE_PG_CONTAINER="$pg"
bash infra/railway/container-smoke.sh "$scratch"
