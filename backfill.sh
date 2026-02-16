#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:3000/api/vision/label-and-translate-post-images"
SECRET_HEADER="x-backfill-secret: iLiFE"

LIMIT=50
PER_POST=6
MAX_RESULTS=12
MAX_TRANSLATE_ITEMS=60
ALLOW_FULL=0

cursor=""

while true; do
  url="${BASE_URL}?limit=${LIMIT}&perPost=${PER_POST}&maxResults=${MAX_RESULTS}&maxTranslateItems=${MAX_TRANSLATE_ITEMS}&allowFull=${ALLOW_FULL}"
  if [[ -n "$cursor" ]]; then
    url="${url}&cursor=$(python - <<PY
import urllib.parse
print(urllib.parse.quote("""$cursor"""))
PY
)"
  fi

  echo ">>> POST $url"
  resp="$(curl -sS -X POST -H "$SECRET_HEADER" "$url")"

  processed="$(echo "$resp" | jq -r '.processed // 0')"
  nextCursor="$(echo "$resp" | jq -r '.nextCursor // ""')"
  ok="$(echo "$resp" | jq -r '.ok // false')"

  echo "$resp" | jq '{ok, scanned, processed, updated, nextCursor, dryRun}'

  if [[ "$ok" != "true" ]]; then
    echo "$resp" | jq .
    exit 1
  fi

  if [[ "$processed" == "0" || -z "$nextCursor" ]]; then
    echo "DONE"
    break
  fi

  cursor="$nextCursor"
done
