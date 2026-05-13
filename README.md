# ALPHA64.EXE

Retro-future Solana memecoin intelligence terminal for public signal pressure and pre-launch chatter scanning.

ALPHA64 is a static dashboard backed by locally generated JSON/JS datasets. It does not trade, post, DM, raid, or automate engagement. It is public research infrastructure and a visual intelligence surface.

## What it shows

- SignalPressure.exe — ranked public token pressure across recent pairs.
- LaunchWindow.sys — pre-launch chatter, speaker proof, launch language, and contract/evidence hints.
- Public contact surfaces — X/community links, websites, Telegram/Discord indicators when available.
- Data snapshots — browser-loadable files under `data/` for static hosting.

## Static hosting

This repo is ready for GitHub Pages.

The included workflow at `.github/workflows/pages.yml` deploys the repository root as a static site whenever `main` is pushed.

After pushing to GitHub, enable Pages with GitHub Actions as the source:

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/OWNER/REPO/pages \
  -f source='{"branch":"main","path":"/"}' || true

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/OWNER/REPO/pages \
  -f build_type=workflow
```

Or in the GitHub UI:

Settings → Pages → Build and deployment → Source: GitHub Actions.

## Local run

```bash
cd /home/jwgir/memecoin-radar
./scripts/run_update.sh
./scripts/serve.sh
```

Then open:

```text
http://localhost:8787
```

From Windows:

```bash
explorer.exe http://localhost:8787
```

## Data refresh

The dashboard reads these static files:

- `data/latest.js`
- `data/latest.json`
- `data/upcoming_launches.js`
- `data/upcoming_launches.json`

Refresh locally with:

```bash
./scripts/run_update.sh
```

Then commit the updated `data/` files.

## X Search / Official X API

By default, the dashboard uses public token profile links only. For deeper X mention/account extraction and the `LaunchWindow.sys` tab, enable official X API access locally.

Option A — xurl OAuth wrapper:

```bash
RADAR_X_SEARCH=1 ./scripts/run_update.sh
```

Option B — direct X API bearer token in the shell environment:

```bash
export RADAR_X_BEARER_TOKEN='your-token-here'
RADAR_X_SEARCH=1 ./scripts/run_update.sh
```

Do not commit credentials. `.env` is ignored. The collector reads bearer tokens from environment variables only and does not write or log them.
