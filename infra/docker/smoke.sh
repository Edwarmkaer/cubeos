#!/usr/bin/env bash
set -euo pipefail
# Only point this script at a disposable installation owned by the caller.
# Creates a device and restarts containers; never removes volumes.
project=${1:?Pass the owned Compose project name}
compose=(docker compose -p "$project" -f infra/docker/compose.yaml)
offline=("${compose[@]}" -f infra/docker/compose.offline.yaml)
curl_probe=(curl --connect-timeout 2 --max-time 6)
api_url="http://127.0.0.1:${API_PORT:-8080}"
web_url="http://127.0.0.1:${WEB_PORT:-3000}"
wait_ready() {
  for attempt in {1..60}; do
    if "${curl_probe[@]}" --silent --fail "$api_url/readyz" >/dev/null; then return; fi
    sleep 1
  done
  echo 'Readiness timeout; HTTP status (000 means connection failure):' >&2
  "${curl_probe[@]}" --silent -o /dev/null -w '%{http_code}\n' "$api_url/readyz" >&2 || true
  "${compose[@]}" ps >&2
  return 1
}
wait_ready
"${curl_probe[@]}" --fail --silent "$api_url/healthz"
"${curl_probe[@]}" --fail --silent "$web_url/visor" -o /tmp/cubeos-smoke-visor.html
grep -q 'Visor' /tmp/cubeos-smoke-visor.html
test "$("${compose[@]}" exec -T api id -u)" != 0
test "$("${compose[@]}" exec -T web id -u)" != 0
device=$("${curl_probe[@]}" --fail --silent -H 'Content-Type: application/json' -d '{"name":"Smoke persistente","protocolDeviceId":"CS01"}' "$api_url/api/v1/devices")
device_id=$(jq -er .id <<<"$device")
profile_before=$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT user_id FROM auth_identities WHERE provider='local' AND subject='installation'")
# Trusted local fixture command exercises the same transactional ingestion use
# case as future transports, without adding a credential-free HTTP endpoint.
fixture=$("${compose[@]}" exec -T api server fixture < packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json)
telemetry_id=$(jq -er .deviceId <<<"$fixture")
snapshot_before=$("${curl_probe[@]}" --fail --silent "$api_url/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
history_before=$("${curl_probe[@]}" --fail --silent "$api_url/api/v1/devices/$telemetry_id/packets" | jq -cS .)
test "$(jq -er .revision <<<"$snapshot_before")" = 5
test "$(jq -er '.packets | length' <<<"$history_before")" = 5
"${compose[@]}" stop db
test "$("${curl_probe[@]}" -s -o /dev/null -w '%{http_code}' "$api_url/healthz")" = 200
test "$("${curl_probe[@]}" -s -o /dev/null -w '%{http_code}' "$api_url/readyz")" = 503
# Boot prepared images without Internet. Probe inside containers because Docker
# internal networks can disable published ports. Preserve the existing volume.
"${compose[@]}" down
"${offline[@]}" up --no-build --pull never -d
for attempt in {1..60}; do
  if "${offline[@]}" exec -T api wget -T 3 -q -O /dev/null "http://127.0.0.1:${API_PORT:-8080}/readyz"; then break; fi
  sleep 1
done
restored=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$device_id")
test "$(jq -er .name <<<"$restored")" = 'Smoke persistente'
test "$(jq -er .protocolDeviceId <<<"$restored")" = CS01
profile_after=$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT user_id FROM auth_identities WHERE provider='local' AND subject='installation'")
test -n "$profile_before"
test "$profile_before" = "$profile_after"
snapshot_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
history_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/packets" | jq -cS .)
test "$snapshot_before" = "$snapshot_after"
test "$history_before" = "$history_after"
"${offline[@]}" exec -T api server rebuild "$telemetry_id"
rebuilt=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
test "$snapshot_before" = "$rebuilt"
network=$(docker inspect "$("${compose[@]}" ps -q api)" --format '{{range $name,$conf := .NetworkSettings.Networks}}{{$name}}{{end}}')
test "$(docker network inspect "$network" --format '{{.Internal}}')" = true
"${compose[@]}" exec -T api sh -c 'if wget -T 3 -q -O /dev/null http://1.1.1.1; then exit 1; fi'
"${compose[@]}" exec -T web node -e 'fetch("http://1.1.1.1",{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1),()=>process.exit(0))'
"${offline[@]}" exec -T web node -e 'fetch("http://127.0.0.1:3000/visor").then(async r=>{if(!r.ok)throw Error(r.status); console.log(await r.text())}).catch(()=>process.exit(1))' > /tmp/cubeos-smoke-visor-offline.html
# Font URLs point to bundled static assets. Verify an asset is served offline.
font=$(grep -oE '/_next/static/[^" ]+\.woff2' /tmp/cubeos-smoke-visor-offline.html | head -1 || true)
test -n "$font"
"${offline[@]}" exec -T web node -e 'fetch("http://127.0.0.1:3000"+process.argv[1]).then(async r=>{if(!r.ok||(await r.arrayBuffer()).byteLength===0)process.exit(1)}).catch(()=>process.exit(1))' "$font"
# Every bundled gallery photo must be served byte-for-byte without egress.
for file in apps/web/public/demo/camera/*.jpg; do
  expected=$(sha256sum "$file" | cut -d ' ' -f1)
  actual=$("${offline[@]}" exec -T web node -e 'const {createHash}=require("node:crypto"); fetch("http://127.0.0.1:3000/demo/camera/"+process.argv[1]).then(async r=>{if(!r.ok)throw Error(r.status);console.log(createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex"))}).catch(()=>process.exit(1))' "${file##*/}")
  test "$expected" = "$actual"
done
"${offline[@]}" down
"${compose[@]}" up --no-build --pull never -d
wait_ready
echo "Smoke passed: non-root, DB-down readiness, persistent device/profile/raw/history/snapshot, deterministic rebuild, blocked-egress boot, offline visor/font and six original photos; loopback installation restored."
