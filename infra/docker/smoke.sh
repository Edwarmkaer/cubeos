#!/usr/bin/env bash
set -euo pipefail
# Only point this script at a disposable installation owned by the caller.
# Creates a device and restarts containers; never removes volumes.
project=${1:?Pass the owned Compose project name}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/cubeos-media-smoke.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT
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
"${curl_probe[@]}" --fail --silent "$web_url/visor" -o "$scratch/visor.html"
grep -q 'Visor' "$scratch/visor.html"
test "$("${compose[@]}" exec -T api id -u)" != 0
test "$("${compose[@]}" exec -T web id -u)" != 0
device=$("${curl_probe[@]}" --fail --silent -H 'Content-Type: application/json' -d '{"name":"Smoke persistente","protocolDeviceId":"CS01"}' "$api_url/api/v1/devices")
device_id=$(jq -er .id <<<"$device")
# Test-only camera file, separate from all bundled DEMO/NASA assets.
node apps/web/tests/media-test-png.mjs > "$scratch/original.png"
media=$("${curl_probe[@]}" --fail --silent -F "file=@$scratch/original.png;type=image/png" "$api_url/api/v1/devices/$device_id/photos")
photo_id=$(jq -er .id <<<"$media")
photo_sha=$(sha256sum "$scratch/original.png" | cut -d ' ' -f1)
test "$(jq -er .sha256 <<<"$media")" = "$photo_sha"
test "$(jq -er .status <<<"$media")" = ready
test "$(jq -c .capturedAt <<<"$media")" = null
"${curl_probe[@]}" --fail --silent "$api_url/api/v1/photos/$photo_id/original" -o "$scratch/download.png"
cmp "$scratch/original.png" "$scratch/download.png"
profile_before=$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT user_id FROM auth_identities WHERE provider='local' AND subject='installation'")
# This disposable smoke owns test-only steps. Production migrations contain none.
step_one=11111111-1111-4111-8111-111111111111
step_two=22222222-2222-4222-8222-222222222222
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U cubeos -d cubeos -c "INSERT INTO steps(id,title,instructions,display_order) VALUES('$step_one','Smoke fixture one','Test-only content',1),('$step_two','Smoke fixture two','Test-only content',2) ON CONFLICT(id) DO NOTHING" >/dev/null
progress_before=$("${curl_probe[@]}" --fail --silent -X PUT -H 'Content-Type: application/json' -d '{"completed":true}' "$api_url/api/v1/devices/$device_id/steps/$step_one" | jq -cS .)
test "$(jq -er .percentage <<<"$progress_before")" = 50
progress_duplicate=$("${curl_probe[@]}" --fail --silent -X PUT -H 'Content-Type: application/json' -d '{"completed":true}' "$api_url/api/v1/devices/$device_id/steps/$step_one" | jq -cS .)
test "$progress_before" = "$progress_duplicate"
# Fixture and authenticated HTTP use the same transactional ingestion service.
provisioned=$("${curl_probe[@]}" --fail --silent -H 'Content-Type: application/json' -d '{"transport":"http","gatewayId":"docker-smoke"}' "$api_url/api/v1/devices/$device_id/sources")
source_id=$(jq -er .id <<<"$provisioned")
source_credential=$(jq -er .credential <<<"$provisioned")
frame='{"envelopeVersion":1,"payload":{"v":2,"id":"CS01","m":"H","n":0,"u":0,"t":0,"st":1,"fl":0,"cam":0,"sd":0,"dp":0}}'
ingested=$("${curl_probe[@]}" --fail --silent -H "Authorization: Bearer $source_credential" -H 'Content-Type: application/json' -d "$frame" "$api_url/api/v1/ingestion/packets")
test "$(jq -er .status <<<"$ingested")" = accepted
transport_before=$("${curl_probe[@]}" --fail --silent "$api_url/api/v1/devices/$device_id/snapshot" | jq -cS .)
fixture=$("${compose[@]}" exec -T api server fixture < packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json)
telemetry_id=$(jq -er .deviceId <<<"$fixture")
snapshot_before=$("${curl_probe[@]}" --fail --silent "$api_url/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
events_before=$(curl --connect-timeout 2 --max-time 1 --no-buffer --silent --fail "$api_url/api/v1/devices/$telemetry_id/events") || test "$?" = 28
event_before=$(sed -n 's/^data: //p' <<<"$events_before" | jq -cS .)
test "$event_before" = "$(jq -cS '{revision,snapshot,freshnessByGroup}' <<<"$snapshot_before")"
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
"${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/photos/$photo_id/original" > "$scratch/offline-original.png"
cmp "$scratch/original.png" "$scratch/offline-original.png"
test "$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT sha256 FROM photos WHERE id='$photo_id' AND status='ready'")" = "$photo_sha"
progress_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$device_id/progress" | jq -cS .)
test "$progress_before" = "$progress_after"
snapshot_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
events_offline=$("${offline[@]}" exec -T api wget -T 1 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/events" 2>/dev/null) || test "$?" = 1
event_offline=$(sed -n 's/^data: //p' <<<"$events_offline" | jq -cS .)
test "$event_before" = "$event_offline"
history_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/packets" | jq -cS .)
test "$snapshot_before" = "$snapshot_after"
test "$history_before" = "$history_after"
transport_after=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$device_id/snapshot" | jq -cS .)
test "$transport_before" = "$transport_after"
test "$("${compose[@]}" exec -T db psql -U cubeos -d cubeos -Atc "SELECT count(*) FROM ingestion_sources WHERE id='$source_id' AND revoked_at IS NULL")" = 1
"${offline[@]}" exec -T api server rebuild "$telemetry_id"
rebuilt=$("${offline[@]}" exec -T api wget -T 6 -q -O - "http://127.0.0.1:${API_PORT:-8080}/api/v1/devices/$telemetry_id/snapshot" | jq -cS .)
test "$snapshot_before" = "$rebuilt"
network=$(docker inspect "$("${compose[@]}" ps -q api)" --format '{{range $name,$conf := .NetworkSettings.Networks}}{{$name}}{{end}}')
test "$(docker network inspect "$network" --format '{{.Internal}}')" = true
"${compose[@]}" exec -T api sh -c 'if wget -T 3 -q -O /dev/null http://1.1.1.1; then exit 1; fi'
"${compose[@]}" exec -T web node -e 'fetch("http://1.1.1.1",{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1),()=>process.exit(0))'
"${offline[@]}" exec -T web node -e 'fetch("http://127.0.0.1:3000/visor").then(async r=>{if(!r.ok)throw Error(r.status); console.log(await r.text())}).catch(()=>process.exit(1))' > "$scratch/visor-offline.html"
# Font URLs point to bundled static assets. Verify an asset is served offline.
font=$(grep -oE '/_next/static/[^" ]+\.woff2' "$scratch/visor-offline.html" | head -1 || true)
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
test "$progress_before" = "$("${curl_probe[@]}" --fail --silent "$api_url/api/v1/devices/$device_id/progress" | jq -cS .)"
unmarked=$("${curl_probe[@]}" --fail --silent -X PUT -H 'Content-Type: application/json' -d '{"completed":false}' "$api_url/api/v1/devices/$device_id/steps/$step_one")
test "$(jq -er .percentage <<<"$unmarked")" = 0
test "$(jq -c '[.steps[].completedAt]' <<<"$unmarked")" = '[null,null]'
events_restored=$(curl --connect-timeout 2 --max-time 1 --no-buffer --silent --fail "$api_url/api/v1/devices/$telemetry_id/events") || test "$?" = 28
test "$event_before" = "$(sed -n 's/^data: //p' <<<"$events_restored" | jq -cS .)"
duplicated=$("${curl_probe[@]}" --fail --silent -H "Authorization: Bearer $source_credential" -H 'Content-Type: application/json' -d "$frame" "$api_url/api/v1/ingestion/packets")
test "$(jq -er .status <<<"$duplicated")" = duplicated
"${curl_probe[@]}" --fail --silent -X DELETE "$api_url/api/v1/devices/$device_id/sources/$source_id" >/dev/null
test "$("${curl_probe[@]}" --silent -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $source_credential" -H 'Content-Type: application/json' -d "$frame" "$api_url/api/v1/ingestion/packets")" = 401
unset source_credential provisioned
echo "Smoke passed: non-root, DB-down readiness, private uploaded original/SHA and construction/device/profile/raw/history/snapshot/SSE persisted across API/DB/volume recreation, unmark, deterministic rebuild, blocked-egress boot, offline media/SSE/visor/fonts and six bundled demo photos; loopback installation restored."
