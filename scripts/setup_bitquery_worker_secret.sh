#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_FILE="${1:-$ROOT/.local-secrets/bitquery.env}"
WORKER_NAME="${ALPHA64_BITQUERY_WORKER:-alpha64-bitquery-dex}"
WORKER_SCRIPT="$ROOT/workers/bitquery-dex-proxy.js"

mkdir -p "$(dirname "$SECRET_FILE")"
if [[ ! -f "$SECRET_FILE" ]]; then
  cat > "$SECRET_FILE" <<'EOF'
# Local-only. Do not commit.
BITQUERY_API_KEY=
EOF
  chmod 600 "$SECRET_FILE" || true
  echo "Created local secret file: $SECRET_FILE"
  echo "Edit it and paste your Bitquery key after BITQUERY_API_KEY=, then rerun this script."
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$SECRET_FILE"
set +a

if [[ -z "${BITQUERY_API_KEY:-}" ]]; then
  echo "BITQUERY_API_KEY is empty in $SECRET_FILE" >&2
  echo "Paste the key into that local file, then rerun." >&2
  exit 2
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for wrangler. Install Node/npm first." >&2
  exit 1
fi

if [[ ! -f "$WORKER_SCRIPT" ]]; then
  echo "Missing Worker script: $WORKER_SCRIPT" >&2
  exit 1
fi

echo "Deploying Worker: $WORKER_NAME"
npx wrangler deploy "$WORKER_SCRIPT" --name "$WORKER_NAME"

echo "Installing Bitquery key as Cloudflare Worker secret. The value will not be printed."
printf '%s' "$BITQUERY_API_KEY" | npx wrangler secret put BITQUERY_API_KEY --name "$WORKER_NAME"

echo
echo "Done. Set this in the site/bootstrap once the Worker URL is known:"
echo "window.ALPHA64_BITQUERY_PROXY = 'https://$WORKER_NAME.<your-cloudflare-subdomain>.workers.dev/';"
