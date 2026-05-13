#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/.update.lock"
LOG="$ROOT/logs/update.log"
mkdir -p "$ROOT/logs" "$ROOT/data"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
(
  flock -n 9 || { echo "$(date -Is) update already running" >> "$LOG"; exit 0; }
  echo "==== $(date -Is) memecoin-radar update start ====" >> "$LOG"
  python3 "$ROOT/scripts/collect.py" >> "$LOG" 2>&1
  python3 "$ROOT/scripts/collect_launches.py" >> "$LOG" 2>&1
  echo "==== $(date -Is) memecoin-radar update end ====" >> "$LOG"
) 9>"$LOCK"
