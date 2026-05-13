#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

printf '\nMemecoin Radar X API setup\n'
printf 'This stores your bearer token locally in: %s\n' "$ENV_FILE"
printf 'Do NOT paste API secrets into chat. Paste them into this terminal prompt only.\n\n'

read -r -s -p "X API Bearer Token: " TOKEN
printf '\n'
if [[ -z "${TOKEN// }" ]]; then
  echo "No token entered. Aborting."
  exit 1
fi

umask 077
TMP="$(mktemp)"
if [[ -f "$ENV_FILE" ]]; then
  grep -vE '^(RADAR_X_BEARER_TOKEN|X_API_BEARER_TOKEN|TWITTER_BEARER_TOKEN|RADAR_X_SEARCH)=' "$ENV_FILE" > "$TMP" || true
else
  : > "$TMP"
fi
{
  cat "$TMP"
  printf 'RADAR_X_BEARER_TOKEN=%q\n' "$TOKEN"
  printf 'RADAR_X_SEARCH=1\n'
} > "$ENV_FILE"
rm -f "$TMP"
chmod 600 "$ENV_FILE"

echo "Saved token to $ENV_FILE with mode 600."
echo "Testing launch collector now..."
cd "$ROOT"
./scripts/run_update.sh
python3 - <<'PY'
import json
from pathlib import Path
p=Path('data/upcoming_launches.json')
d=json.loads(p.read_text())
print(json.dumps({
  'source': d.get('source'),
  'counts': d.get('counts'),
  'launches': len(d.get('launches', [])),
}, indent=2))
PY
