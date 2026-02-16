#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3000/api/vision/label-and-translate-post-images"
SECRET="iLiFE"

LIMIT=50
PERPOST=6
MAXRESULTS=12
MAXTRANS=60

cursor=""

while true; do
  url="${BASE}?limit=${LIMIT}&perPost=${PERPOST}&maxResults=${MAXRESULTS}&maxTranslateItems=${MAXTRANS}"
  if [[ -n "$cursor" ]]; then
    url="${url}&cursor=$(python3 - <<PY
import urllib.parse
print(urllib.parse.quote("""$cursor"""))
PY
)"
  fi

  echo ">>> POST $url"
  resp=$(curl -sS -X POST -H "x-backfill-secret: ${SECRET}" "$url")

  ok=$(python3 - <<PY
import json,sys
d=json.loads(sys.argv[1])
print("1" if d.get("ok") else "0")
PY
"$resp")

  if [[ "$ok" != "1" ]]; then
    echo "$resp"
    exit 1
  fi

  processed=$(python3 - <<PY
import json,sys
d=json.loads(sys.argv[1])
print(d.get("processed",0))
PY
"$resp")

  next=$(python3 - <<PY
import json,sys
d=json.loads(sys.argv[1])
print(d.get("nextCursor") or "")
PY
"$resp")

  echo "processed=$processed nextCursor=$next"

  # もう拾うものがない
  if [[ "$processed" -eq 0 ]]; then
    echo "DONE (processed=0)"
    break
  fi

  # cursor更新（次ページへ）
  cursor="$next"

  # 念のため next が空なら抜け（無限ループ防止）
  if [[ -z "$cursor" ]]; then
    echo "DONE (nextCursor empty)"
    break
  fi
done
