#!/usr/bin/env bash
set -euo pipefail
# Only point this script at a disposable installation owned by the caller.
# Creates a device and restarts containers; never removes volumes.
project=${1:?Pass the owned Compose project name}
compose=(docker compose -p "$project" -f infra/docker/compose.yaml)
api_url="http://127.0.0.1:${API_PORT:-8080}"
web_url="http://127.0.0.1:${WEB_PORT:-3000}"
wait_ready() {
  for attempt in {1..60}; do
    if curl --silent --fail "$api_url/readyz" >/dev/null; then return; fi
    sleep 1
  done
  return 1
}
wait_ready
curl --fail --silent "$api_url/healthz"
curl --fail --silent "$web_url/visor" -o /tmp/cubeos-smoke-visor.html
grep -q 'Visor' /tmp/cubeos-smoke-visor.html
test "$("${compose[@]}" exec -T api id -u)" != 0
test "$("${compose[@]}" exec -T web id -u)" != 0
device=$(curl --fail --silent -H 'Content-Type: application/json' -d '{"name":"Smoke persistente","protocolDeviceId":"CS01"}' "$api_url/api/v1/devices")
device_id=$(jq -er .id <<<"$device")
profile_before=$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT user_id FROM auth_identities WHERE provider='local' AND subject='installation'")
"${compose[@]}" stop db
test "$(curl -s -o /dev/null -w '%{http_code}' "$api_url/healthz")" = 200
test "$(curl -s -o /dev/null -w '%{http_code}' "$api_url/readyz")" = 503
# Recreate the entire installation from prepared images on its internal network.
"${compose[@]}" down
"${compose[@]}" up --no-build --pull never -d
wait_ready
restored=$(curl --fail --silent "$api_url/api/v1/devices/$device_id")
test "$(jq -er .name <<<"$restored")" = 'Smoke persistente'
test "$(jq -er .protocolDeviceId <<<"$restored")" = CS01
profile_after=$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT user_id FROM auth_identities WHERE provider='local' AND subject='installation'")
test -n "$profile_before"
test "$profile_before" = "$profile_after"
network=$(docker inspect "$("${compose[@]}" ps -q api)" --format '{{range $name,$conf := .NetworkSettings.Networks}}{{$name}}{{end}}')
test "$(docker network inspect "$network" --format '{{.Internal}}')" = true
"${compose[@]}" exec -T api sh -c 'if wget -T 3 -q -O /dev/null http://1.1.1.1; then exit 1; fi'
"${compose[@]}" exec -T web node -e 'fetch("http://1.1.1.1",{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1),()=>process.exit(0))'
curl --fail --silent "$web_url/visor" -o /tmp/cubeos-smoke-visor-offline.html
# Font URLs point to bundled static assets. Verify an asset is served offline.
font=$(grep -oE '/_next/static/[^" ]+\.woff2' /tmp/cubeos-smoke-visor-offline.html | head -1 || true)
test -n "$font"
curl --fail --silent "$web_url$font" -o /tmp/cubeos-smoke-font.woff2
test -s /tmp/cubeos-smoke-font.woff2
echo "Smoke passed: non-root, DB-down readiness, persistent device/profile, internal network, blocked egress, offline visor and bundled font."
