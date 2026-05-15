#!/usr/bin/env python3
"""
Upcoming Launch Radar collector.

Tracks public X chatter about memecoin launches expected in the next 24h.
Uses the official X API either through xurl auth or a bearer token supplied via
environment variable. Without API auth, writes a truthful empty dataset with setup
instructions instead of fake data.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
NOW = dt.datetime.now(dt.timezone.utc)
UA = 'Mozilla/5.0 memecoin-radar-launches/0.1'
MAX_RESULTS_PER_QUERY = int(os.getenv('LAUNCH_RADAR_X_RESULTS', '40'))
SEARCH_ENABLED = os.getenv('RADAR_X_SEARCH', '0').lower() in {'1','true','yes','on'}
X_BEARER = (
    os.getenv('RADAR_X_BEARER_TOKEN')
    or os.getenv('X_API_BEARER_TOKEN')
    or os.getenv('TWITTER_BEARER_TOKEN')
)

QUERIES = [
    '(memecoin OR meme coin) (launching OR launch) (tomorrow OR today OR "24 hours" OR "24h") -is:retweet lang:en',
    '("fair launch" OR "stealth launch") (memecoin OR pumpfun OR "pump.fun" OR solana) -is:retweet lang:en',
    '("launching on" OR "goes live" OR "launch at") (pump.fun OR raydium OR solana OR base) -is:retweet lang:en',
    '("presale ends" OR "launch in") (memecoin OR solana OR base) -is:retweet lang:en',
    '("CA soon" OR "contract soon" OR "token launch") (meme OR memecoin) -is:retweet lang:en',
]
LAUNCH_WORDS = re.compile(r'\b(launch|launching|goes live|fair launch|stealth launch|presale ends|ca soon|contract soon|token launch|pump\.fun)\b', re.I)
TIME_WORDS = re.compile(r'\b(today|tomorrow|24h|24 hours|tonight|in \d+\s*(?:h|hr|hrs|hours)|\d{1,2}\s*(?:am|pm)\s*(?:utc|est|pst|cet)?)\b', re.I)
HANDLE_RE = re.compile(r'(?<![\w])@([A-Za-z0-9_]{1,15})')
URL_RE = re.compile(r'https?://[^\s)\]}>"\']+')
CA_RE = re.compile(r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b')
TICKER_RE = re.compile(r'(?<![\w])\$([A-Za-z][A-Za-z0-9_]{1,12})\b')
EXCLUDED_PAUSED_TERMS = re.compile(r'\b(?:k' + 'ol' + 's?|leader' + 'board)\b', re.I)
GENERIC_PROJECT_KEYS = {
    'a','an','and','are','at','best','coin','contract','crypto','digital','dev','excuse','fair','for','from','goes','it','launch','launching','live','meme','memecoin','new','official','on','presale','project','soon','stealth','the','this','token','today','tomorrow','with','world'
}


def write_payload(payload):
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA/'upcoming_launches.json').write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
    (DATA/'upcoming_launches.js').write_text('window.MEMECOIN_UPCOMING_LAUNCHES = ' + json.dumps(payload, ensure_ascii=False) + ';\n', encoding='utf-8')


def run(cmd, timeout=45):
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)


def xurl_status():
    if not shutil.which('xurl'):
        return False, 'xurl command not installed'
    try:
        p=run(['xurl','auth','status'], timeout=15)
        if p.returncode != 0:
            return False, 'xurl auth status failed'
        out=(p.stdout+p.stderr).lower()
        if 'token' in out or 'oauth' in out or 'authenticated' in out:
            return True, 'xurl ready'
        return False, 'xurl installed but auth not detected'
    except Exception as e:
        return False, f'xurl status error: {e}'


def x_api_status():
    if X_BEARER:
        return True, 'X API bearer token ready'
    return False, 'no xurl auth or X API bearer token found'


def parse_json_items(raw):
    try:
        data=json.loads(raw)
    except Exception:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('data','tweets','results','items'):
            if isinstance(data.get(key), list):
                return data[key]
        if isinstance(data.get('data'), dict):
            return [data['data']]
    return []


def x_api_search(query, max_results):
    """Search recent public tweets via official X API v2.

    Requires RADAR_X_BEARER_TOKEN, X_API_BEARER_TOKEN, or TWITTER_BEARER_TOKEN in
    the process environment. Never logs or writes the token.
    """
    params={
        'query': query,
        'max_results': str(max(10, min(100, max_results))),
        'tweet.fields': 'created_at,author_id,entities,lang,public_metrics',
        'expansions': 'author_id',
        'user.fields': 'username,name,verified,public_metrics',
    }
    url='https://api.x.com/2/tweets/search/recent?' + urllib.parse.urlencode(params)
    req=urllib.request.Request(
        url,
        headers={
            'Authorization': 'Bearer ' + X_BEARER,
            'User-Agent': UA,
            'Accept': 'application/json',
        }
    )
    try:
        payload=json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8','replace'))
    except urllib.error.HTTPError as e:
        body=e.read().decode('utf-8','replace')[:500]
        raise RuntimeError(f'X API HTTP {e.code}: {body}')
    users={u.get('id'):u for u in ((payload.get('includes') or {}).get('users') or [])}
    out=[]
    for t in payload.get('data') or []:
        user=users.get(t.get('author_id')) or {}
        tid=t.get('id')
        username=user.get('username')
        out.append({
            'id': tid,
            'text': t.get('text') or '',
            'created_at': t.get('created_at'),
            'author_id': t.get('author_id'),
            'author': user,
            'username': username,
            'url': f'https://x.com/{username}/status/{tid}' if username and tid else None,
            'entities': t.get('entities') or {},
            'public_metrics': t.get('public_metrics') or {},
        })
    return out


def search_x(query, max_results):
    if X_BEARER:
        return x_api_search(query, max_results), 'x_api_bearer'
    p=run(['xurl','search',query,'-n',str(max_results)], timeout=60)
    if p.returncode != 0:
        raise RuntimeError(p.stderr[:500] or p.stdout[:500] or 'xurl search failed')
    return parse_json_items(p.stdout), 'xurl'


def flatten_text(obj):
    if isinstance(obj, str): return obj
    try: return json.dumps(obj, ensure_ascii=False)
    except Exception: return str(obj)


def get_text(obj):
    if isinstance(obj, dict):
        for k in ('text','full_text','body','content'):
            if isinstance(obj.get(k), str): return obj[k]
    return flatten_text(obj)


def get_author(obj, text):
    handles = HANDLE_RE.findall(text)
    if isinstance(obj, dict):
        user = obj.get('user') or obj.get('author') or obj.get('author_user') or {}
        if isinstance(user, dict):
            h = user.get('username') or user.get('screen_name') or user.get('handle')
            if h: return '@' + str(h).lstrip('@')
        for k in ('username','screen_name','handle','author_username'):
            if obj.get(k): return '@' + str(obj[k]).lstrip('@')
    return '@'+handles[0] if handles else None


def get_url(obj):
    if isinstance(obj, dict):
        for k in ('url','tweet_url','link'):
            if isinstance(obj.get(k), str) and obj[k].startswith('http'):
                return obj[k]
        tid = obj.get('id') or obj.get('id_str')
        author = get_author(obj, flatten_text(obj))
        if tid and author:
            return f'https://x.com/{author.lstrip("@")} /status/{tid}'.replace(' /','/')
    return None


def clean_project_key(key):
    if not key:
        return None
    key=str(key).strip().strip('.,:;!?)(')
    if not key:
        return None
    bare=key[1:] if key.startswith('$') else key
    if bare.lower() in GENERIC_PROJECT_KEYS:
        return None
    if len(bare) < 2:
        return None
    return ('$'+bare.upper()) if key.startswith('$') else bare[:32]


def extract_project_key(text):
    tickers=TICKER_RE.findall(text)
    for ticker in tickers:
        key=clean_project_key('$'+ticker)
        if key:
            return key
    contracts=CA_RE.findall(text)
    if contracts:
        return contracts[0]
    # Common launch-name patterns. Keep this conservative: generic words like
    # "launch an excuse today" previously collapsed unrelated tweets into one
    # fake UNKNOWN-LAUNCH cluster, which made LaunchWindow look broken.
    m=re.search(r'(?:launch(?:ing)?|fair launch|stealth launch)\s+(?:of\s+)?([A-Z][A-Za-z0-9_]{2,24})', text)
    if m:
        key=clean_project_key(m.group(1))
        if key:
            return key
    urls=URL_RE.findall(text)
    for u in urls:
        if 'x.com' not in u and 'twitter.com' not in u and 't.co' not in u:
            try:
                host=urllib.parse.urlparse(u).netloc.lower().replace('www.','')
                if host and host not in {'t.co'}:
                    key=clean_project_key(host.split('.')[0][:24])
                    if key:
                        return key
            except Exception: pass
    return None


def security_check(text, speakers, urls, prior_tokens):
    signals=[]; warnings=[]; score=0
    if LAUNCH_WORDS.search(text): signals.append('launch_language'); score+=15
    if TIME_WORDS.search(text): signals.append('24h_time_language'); score+=15
    if CA_RE.search(text): signals.append('contract_address_present'); score+=10
    if any('x.com' in u or 'twitter.com' in u for u in urls): signals.append('x_link_present'); score+=5
    if any('t.me' in u or 'telegram' in u for u in urls): signals.append('telegram_link_present'); score+=6
    if any('discord' in u for u in urls): signals.append('discord_link_present'); score+=5
    if len(speakers)>=3: signals.append('multiple_people_discussing'); score+=20
    elif len(speakers)==2: signals.append('two_people_discussing'); score+=10
    else: warnings.append('single_source_claim')
    if prior_tokens: signals.append('speaker_has_prior_token_links'); score+=10
    if not TIME_WORDS.search(text): warnings.append('no_clear_24h_time_phrase')
    if not urls: warnings.append('no_external_project_links')
    if len(speakers)==1 and not urls: warnings.append('weak_validity')
    verdict = 'higher-confidence' if score>=55 else 'medium' if score>=35 else 'needs-manual-review'
    return {'verdict': verdict, 'score': min(score,100), 'signals': sorted(set(signals)), 'warnings': sorted(set(warnings))}


def dexscreener_search(query):
    try:
        url='https://api.dexscreener.com/latest/dex/search?q='+urllib.parse.quote(query)
        req=urllib.request.Request(url, headers={'User-Agent':UA,'Accept':'application/json'})
        data=json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8','replace'))
        return data.get('pairs') or []
    except Exception:
        return []


def prior_launches_for_speaker(handle):
    if not handle: return []
    q=handle.lstrip('@')
    pairs=dexscreener_search(q)
    out=[]
    for p in pairs[:8]:
        info=p.get('info') or {}
        socials=json.dumps(info.get('socials') or [], ensure_ascii=False).lower()
        websites=json.dumps(info.get('websites') or [], ensure_ascii=False).lower()
        if q.lower() in socials or q.lower() in websites or q.lower() in json.dumps(p, ensure_ascii=False).lower():
            out.append({
                'symbol': (p.get('baseToken') or {}).get('symbol'),
                'name': (p.get('baseToken') or {}).get('name'),
                'chainId': p.get('chainId'),
                'pairUrl': p.get('url'),
                'marketCap': p.get('marketCap') or p.get('fdv'),
                'liquidityUsd': ((p.get('liquidity') or {}).get('usd')),
                'pairCreatedAt': p.get('pairCreatedAt'),
            })
    return out[:5]


def main():
    xurl_ok, xurl_reason = xurl_status()
    api_ok, api_reason = x_api_status()
    ok = api_ok or xurl_ok
    reason = api_reason if api_ok else (xurl_reason if xurl_ok else f'{xurl_reason}; {api_reason}')
    if not SEARCH_ENABLED or not ok:
        payload={
            'generatedAt': NOW.isoformat(),
            'windowHours': 24,
            'source': {'xSearchEnabled': SEARCH_ENABLED, 'xurlReady': xurl_ok, 'xApiReady': api_ok, 'reason': reason, 'realData': False},
            'launches': [],
            'instructions': [
                'Upcoming launch tracking requires official X API access. Either install/authenticate xurl or export RADAR_X_BEARER_TOKEN, then run RADAR_X_SEARCH=1 ./scripts/run_update.sh.',
                'No fake launch rows are generated.'
            ]
        }
        write_payload(payload)
        print(json.dumps({'upcomingLaunches':0,'reason':reason,'xSearchEnabled':SEARCH_ENABLED,'xApiReady':api_ok,'xurlReady':xurl_ok}, indent=2))
        return

    raw_items=[]
    search_backend=None
    search_errors=[]
    for q in QUERIES:
        try:
            items, backend = search_x(q, MAX_RESULTS_PER_QUERY)
            search_backend = backend
            for item in items:
                raw_items.append({'query':q,'item':item})
            time.sleep(1)
        except Exception as e:
            raw_msg = str(e)
            if 'CreditsDepleted' in raw_msg or 'credits' in raw_msg.lower():
                msg = 'X API credits depleted or not yet propagated for recent search.'
            else:
                msg = raw_msg[:220]
            search_errors.append({'query': q, 'error': msg})
            print(f'WARN X search exception {q}: {msg}', file=sys.stderr)

    if search_errors and not raw_items and search_backend is None:
        payload={
            'generatedAt': NOW.isoformat(),
            'windowHours': 24,
            'source': {
                'xSearchEnabled': True,
                'xurlReady': xurl_ok,
                'xApiReady': api_ok,
                'backend': 'x_api_bearer' if api_ok else 'xurl',
                'reason': search_errors[0]['error'],
                'realData': False,
                'queries': QUERIES,
                'errors': search_errors[:5],
            },
            'launches': [],
            'counts': {'rawMentions': 0, 'launches': 0, 'searchErrors': len(search_errors)},
            'instructions': ['X API access is configured, but recent-search requests failed. Verify credits/plan propagation, then rerun ./scripts/run_update.sh.']
        }
        write_payload(payload)
        print(json.dumps({'upcomingLaunches':0,'rawMentions':0,'searchErrors':len(search_errors),'reason':search_errors[0]['error']}, indent=2))
        return

    grouped={}
    for r in raw_items:
        text=get_text(r['item'])
        if not LAUNCH_WORDS.search(text):
            continue
        if EXCLUDED_PAUSED_TERMS.search(text):
            continue
        # require some next-24h-ish phrase; keeps the tab from becoming generic launch noise
        if not TIME_WORDS.search(text):
            continue
        key=extract_project_key(text)
        if not key:
            continue
        g=grouped.setdefault(key, {'project':key, 'mentions':[], 'speakers':{}, 'urls':set(), 'tickers':set(), 'contracts':set(), 'queries':set(), 'combinedText':''})
        author=get_author(r['item'], text)
        tweet_url=get_url(r['item'])
        urls=URL_RE.findall(text)
        for u in urls: g['urls'].add(u.rstrip('.,'))
        for ca in CA_RE.findall(text): g['contracts'].add(ca)
        for tic in TICKER_RE.findall(text): g['tickers'].add('$'+tic.upper())
        if author:
            g['speakers'].setdefault(author, {'handle':author,'xUrl':'https://x.com/'+author.lstrip('@'),'mentions':0,'tweetUrls':[]})
            g['speakers'][author]['mentions'] += 1
            if tweet_url: g['speakers'][author]['tweetUrls'].append(tweet_url)
        g['queries'].add(r['query'])
        g['combinedText'] += '\n' + text[:1000]
        g['mentions'].append({'author':author, 'tweetUrl':tweet_url, 'text':text[:500], 'query':r['query']})

    launches=[]
    prior_cache={}
    for key,g in grouped.items():
        speakers=list(g['speakers'].values())
        priors=[]
        for sp in speakers[:8]:
            h=sp['handle']
            if h not in prior_cache:
                prior_cache[h]=prior_launches_for_speaker(h)
                time.sleep(0.15)
            sp['priorTokens']=prior_cache[h]
            for t in prior_cache[h]:
                priors.append({'speaker':h, **t})
        sec=security_check(g['combinedText'], speakers, list(g['urls']), priors)
        launches.append({
            'project': key,
            'tickers': sorted(g['tickers']),
            'contracts': sorted(g['contracts']),
            'speakers': sorted(speakers, key=lambda s:s['mentions'], reverse=True),
            'mentions': g['mentions'][:20],
            'urls': sorted(g['urls']),
            'queries': sorted(g['queries']),
            'security': sec,
            'priorTokens': priors[:15],
            'score': sec['score'] + min(30, len(g['mentions'])*3 + len(speakers)*4),
        })
    launches.sort(key=lambda x:x['score'], reverse=True)
    payload={
        'generatedAt': NOW.isoformat(),
        'windowHours': 24,
        'source': {'xSearchEnabled': True, 'xurlReady': xurl_ok, 'xApiReady': api_ok, 'backend': search_backend or ('x_api_bearer' if api_ok else 'xurl'), 'reason':'official X API search', 'realData': True, 'queries': QUERIES},
        'launches': launches[:80],
        'counts': {'rawMentions': len(raw_items), 'launches': len(launches)},
    }
    write_payload(payload)
    print(json.dumps({'upcomingLaunches':len(launches),'rawMentions':len(raw_items),'out':str(DATA/'upcoming_launches.json')}, indent=2))

if __name__ == '__main__':
    main()
