#!/usr/bin/env python3
"""
Memecoin Radar collector.

Non-custodial market/intel monitor. It does not trade, DM, post, raid, or engage.
It collects public token + social metadata and produces dashboard JSON/JS.
"""
import datetime as dt
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UA = "Mozilla/5.0 memecoin-radar/0.1 (+local research dashboard)"
NOW = dt.datetime.now(dt.timezone.utc)
TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
MAX_TOKENS = int(os.getenv("RADAR_MAX_TOKENS", "90"))
XURL_ENABLED = os.getenv("XURL_ENABLED", "1") not in {"0", "false", "False", "no"}

DEX_ENDPOINTS = [
    "https://api.dexscreener.com/token-profiles/latest/v1",
    "https://api.dexscreener.com/token-boosts/latest/v1",
    "https://api.dexscreener.com/token-boosts/top/v1",
]

MEME_TERMS = [
    "pepe", "dog", "cat", "frog", "wif", "bonk", "inu", "chad", "wojak", "meme",
    "pump", "trencher", "cto", "cult", "community", "raid", "sendor", "degen",
]


def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def ms_to_iso(ms):
    if not ms:
        return None
    try:
        return dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc).isoformat()
    except Exception:
        return None


def safe_float(x, default=0.0):
    try:
        if x is None or x == "":
            return default
        return float(x)
    except Exception:
        return default


def get_nested(d, *keys, default=0):
    cur = d or {}
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def normalize_url(u):
    if not u:
        return None
    if isinstance(u, dict):
        u = u.get("url") or u.get("href") or u.get("link")
    if not isinstance(u, str):
        return None
    u = u.strip()
    if not u:
        return None
    if u.startswith("//"):
        u = "https:" + u
    if not re.match(r"https?://", u):
        u = "https://" + u
    return u


def extract_links(*objects):
    links = []
    def add(label, url, source):
        url = normalize_url(url)
        if not url:
            return
        key = url.lower().rstrip("/")
        if key not in {x["url"].lower().rstrip("/") for x in links}:
            links.append({"label": label or classify_link(url), "url": url, "source": source, "kind": classify_link(url)})

    for obj in objects:
        if not isinstance(obj, dict):
            continue
        for key in ("url", "website", "twitter", "telegram", "discord"):
            if obj.get(key):
                add(key, obj.get(key), key)
        for link in obj.get("links") or []:
            if isinstance(link, dict):
                add(link.get("label") or link.get("type"), link.get("url"), "profile.links")
            else:
                add(None, link, "profile.links")
        info = obj.get("info") or {}
        for site in info.get("websites") or []:
            add(site.get("label") if isinstance(site, dict) else None, site, "pair.info.websites")
        for soc in info.get("socials") or []:
            if isinstance(soc, dict):
                add(soc.get("type") or soc.get("label"), soc.get("url"), "pair.info.socials")
    return links


def classify_link(url):
    u = (url or "").lower()
    if "x.com" in u or "twitter.com" in u:
        if "/i/communities/" in u:
            return "x_community"
        return "x_account"
    if "t.me" in u or "telegram" in u:
        return "telegram"
    if "discord" in u or "discord.gg" in u:
        return "discord"
    if "dexscreener" in u:
        return "dexscreener"
    return "website"


def extract_handle(url):
    if not url:
        return None
    m = re.search(r"(?:x\.com|twitter\.com)/(?!(?:i|intent|share|search|home|hashtag)\b)([A-Za-z0-9_]{1,15})", url)
    return "@" + m.group(1) if m else None


def raid_signals_from_links(links, text=""):
    sig = []
    low = (text or "").lower()
    if "raid" in low:
        sig.append("description_mentions_raid")
    if "cto" in low or "community takeover" in low:
        sig.append("cto_language")
    kinds = {l.get("kind") for l in links}
    if "telegram" in kinds:
        sig.append("telegram_coordination_link")
    if "discord" in kinds:
        sig.append("discord_coordination_link")
    if "x_community" in kinds:
        sig.append("x_community_link")
    return sorted(set(sig))


def collect_seed_tokens():
    by_key = {}
    for url in DEX_ENDPOINTS:
        try:
            payload = fetch_json(url)
            if isinstance(payload, dict):
                items = payload.get("data") or payload.get("tokens") or payload.get("pairs") or []
            else:
                items = payload
            for item in items[:250]:
                chain = item.get("chainId")
                addr = item.get("tokenAddress") or item.get("address")
                if chain and addr:
                    key = f"{chain}:{addr}"
                    by_key.setdefault(key, {}).update(item)
                    by_key[key].setdefault("sources", []).append(url.rsplit('/', 2)[-2] if '/v1' in url else url.rsplit('/',1)[-1])
        except Exception as e:
            print(f"WARN seed endpoint failed {url}: {e}", file=sys.stderr)
    return list(by_key.values())[:MAX_TOKENS]


def get_pairs(token):
    chain = token.get("chainId")
    addr = token.get("tokenAddress") or token.get("address")
    if not chain or not addr:
        return []
    url = f"https://api.dexscreener.com/token-pairs/v1/{urllib.parse.quote(chain)}/{urllib.parse.quote(addr)}"
    try:
        pairs = fetch_json(url)
        return pairs if isinstance(pairs, list) else []
    except Exception as e:
        print(f"WARN pair lookup failed {chain}:{addr}: {e}", file=sys.stderr)
        return []


def is_probable_memecoin(pair, profile):
    txt = " ".join([
        get_nested(pair, "baseToken", "name", default="") or "",
        get_nested(pair, "baseToken", "symbol", default="") or "",
        profile.get("description") or "",
    ]).lower()
    return any(term in txt for term in MEME_TERMS) or str(get_nested(pair, "baseToken", "address", default="")).endswith("pump")


def score_candidate(pair, profile, links, x_stats):
    created = pair.get("pairCreatedAt") or 0
    age_hours = max(1, (int(NOW.timestamp() * 1000) - int(created or 0)) / 3_600_000) if created else 9999
    volume_h24 = safe_float(get_nested(pair, "volume", "h24"))
    volume_h1 = safe_float(get_nested(pair, "volume", "h1"))
    tx_h1 = safe_float(get_nested(pair, "txns", "h1", "buys")) + safe_float(get_nested(pair, "txns", "h1", "sells"))
    tx_m5 = safe_float(get_nested(pair, "txns", "m5", "buys")) + safe_float(get_nested(pair, "txns", "m5", "sells"))
    liquidity = safe_float(get_nested(pair, "liquidity", "usd"))
    boosts = safe_float(profile.get("amount") or profile.get("totalAmount") or 0)
    link_score = len([l for l in links if l["kind"] in {"x_account", "x_community", "telegram", "discord"}]) * 8
    x_score = min(35, x_stats.get("tweet_count", 0) * 3 + x_stats.get("unique_accounts", 0) * 2)
    raid_score = len(raid_signals_from_links(links, profile.get("description"))) * 10
    freshness = max(0, 35 - age_hours / 8)
    market = min(35, math.log10(volume_h24 + 1) * 7 + math.log10(volume_h1 + 1) * 5 + tx_h1 * 0.08 + tx_m5 * 0.5)
    liq_penalty = -15 if liquidity and liquidity < 5000 else 0
    score = freshness + market + boosts * 0.25 + link_score + x_score + raid_score + liq_penalty
    return round(max(0, score), 2)


def xurl_available():
    if not XURL_ENABLED or not shutil.which("xurl"):
        return False, "xurl_not_installed_or_disabled"
    try:
        p = subprocess.run(["xurl", "auth", "status"], text=True, capture_output=True, timeout=15)
        if p.returncode != 0:
            return False, "xurl_auth_status_failed"
        if "oauth2" not in p.stdout.lower() and "token" not in p.stdout.lower():
            return False, "xurl_no_oauth_token_detected"
        return True, "xurl_ready"
    except Exception as e:
        return False, f"xurl_error:{e}"


def parse_xurl_items(raw):
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "tweets", "results"):
            if isinstance(data.get(key), list):
                return data[key]
        if isinstance(data.get("data"), dict):
            return [data["data"]]
    return []


def query_x(symbol, name):
    ok, reason = xurl_available()
    if not ok:
        return {"available": False, "reason": reason, "tweet_count": 0, "unique_accounts": 0, "accounts": [], "communities": []}
    terms = []
    if symbol:
        terms.append(f"${symbol}")
    if name and len(name) <= 32:
        terms.append(f'"{name}"')
    q = " OR ".join(terms[:2]) + " lang:en -is:retweet"
    try:
        p = subprocess.run(["xurl", "search", q, "-n", "20"], text=True, capture_output=True, timeout=35)
        items = parse_xurl_items(p.stdout)
    except Exception as e:
        return {"available": True, "reason": f"xurl_query_error:{e}", "tweet_count": 0, "unique_accounts": 0, "accounts": [], "communities": []}
    accounts = {}
    communities = set()
    for it in items:
        txt = json.dumps(it, ensure_ascii=False)
        for h in re.findall(r"@([A-Za-z0-9_]{1,15})", txt):
            accounts.setdefault("@" + h, {"handle": "@" + h, "mentions": 0})["mentions"] += 1
        for cid in re.findall(r"x\.com/i/communities/(\d+)", txt):
            communities.add(f"https://x.com/i/communities/{cid}")
        # common X API includes author_id only; no handle unless expansions are present
    top = sorted(accounts.values(), key=lambda a: a["mentions"], reverse=True)[:10]
    return {"available": True, "reason": "xurl_search", "tweet_count": len(items), "unique_accounts": len(top), "accounts": top, "communities": sorted(communities)}


def build_candidate(profile, pair):
    base = pair.get("baseToken") or {}
    symbol = base.get("symbol") or profile.get("symbol") or ""
    name = base.get("name") or profile.get("name") or ""
    links = extract_links(profile, pair)
    handles = sorted(set(filter(None, [extract_handle(l["url"]) for l in links if l.get("kind") in {"x_account", "x_community"}])))
    x_stats = query_x(symbol, name) if os.getenv("RADAR_X_SEARCH", "0") in {"1", "true", "True", "yes"} else {"available": False, "reason": "RADAR_X_SEARCH_disabled", "tweet_count": 0, "unique_accounts": 0, "accounts": [], "communities": []}
    created_ms = pair.get("pairCreatedAt") or 0
    age_hours = (int(NOW.timestamp() * 1000) - int(created_ms or 0)) / 3_600_000 if created_ms else None
    raid = raid_signals_from_links(links, profile.get("description", ""))
    score = score_candidate(pair, profile, links, x_stats)
    contact_targets = []
    for l in links:
        if l["kind"] in {"x_account", "x_community", "telegram", "discord", "website"}:
            contact_targets.append(l)
    return {
        "chainId": pair.get("chainId"),
        "dexId": pair.get("dexId"),
        "pairUrl": pair.get("url"),
        "pairAddress": pair.get("pairAddress"),
        "tokenAddress": base.get("address") or profile.get("tokenAddress"),
        "name": name,
        "symbol": symbol,
        "description": profile.get("description") or get_nested(pair, "info", "description", default=""),
        "image": get_nested(pair, "info", "imageUrl", default=None) or profile.get("icon"),
        "createdAt": ms_to_iso(created_ms),
        "ageHours": round(age_hours, 2) if age_hours is not None else None,
        "priceUsd": pair.get("priceUsd"),
        "marketCap": safe_float(pair.get("marketCap") or pair.get("fdv")),
        "liquidityUsd": safe_float(get_nested(pair, "liquidity", "usd")),
        "volume": pair.get("volume") or {},
        "txns": pair.get("txns") or {},
        "priceChange": pair.get("priceChange") or {},
        "links": links,
        "xHandles": handles,
        "xStats": x_stats,
        "raidSignals": raid,
        "contactTargets": contact_targets[:12],
        "sources": profile.get("sources") or [],
        "score": score,
        "warnings": [w for w in ["low_liquidity" if safe_float(get_nested(pair, "liquidity", "usd")) < 5000 else None, "no_public_contact_link" if not contact_targets else None] if w],
    }


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    seeds = collect_seed_tokens()
    candidates = []
    seen_pairs = set()
    cutoff = int(NOW.timestamp() * 1000) - TWO_WEEKS_MS
    for i, token in enumerate(seeds):
        pairs = get_pairs(token)
        time.sleep(0.18)  # stay polite with public API
        for pair in pairs:
            pair_id = f"{pair.get('chainId')}:{pair.get('pairAddress')}"
            if pair_id in seen_pairs:
                continue
            seen_pairs.add(pair_id)
            created = int(pair.get("pairCreatedAt") or 0)
            if created and created < cutoff:
                continue
            if not is_probable_memecoin(pair, token):
                # profiles/latest is broad; keep boosted fresh tokens but downselect obvious meme language
                continue
            candidates.append(build_candidate(token, pair))
    candidates.sort(key=lambda x: x["score"], reverse=True)
    payload = {
        "generatedAt": NOW.isoformat(),
        "windowDays": 14,
        "source": {
            "dexscreener": True,
            "xurlInstalled": bool(shutil.which("xurl")),
            "xSearchEnabled": os.getenv("RADAR_X_SEARCH", "0") in {"1", "true", "True", "yes"},
            "notes": "X search is optional and disabled by default unless RADAR_X_SEARCH=1 and xurl auth is configured. Contact targets come from public token profile links and optional X search results.",
        },
        "counts": {"seeds": len(seeds), "candidates": len(candidates)},
        "candidates": candidates[:80],
    }
    (DATA / "latest.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    (DATA / "latest.js").write_text("window.MEMECOIN_RADAR_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    (DATA / "last_update.txt").write_text(f"{NOW.isoformat()} candidates={len(candidates)}\n", encoding="utf-8")
    print(json.dumps({"generatedAt": payload["generatedAt"], "candidates": len(candidates), "out": str(DATA / "latest.json")}, indent=2))

if __name__ == "__main__":
    main()
