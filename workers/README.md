# ALPHA64 Bitquery DEX Proxy

The static GitHub Pages site must never include the Bitquery API key in `index.html`, `assets/app.js`, or any public file. Use this Cloudflare Worker as a tiny API-key firewall.

## Deploy

```bash
cd /home/jwgir/memecoin-radar
npx wrangler deploy workers/bitquery-dex-proxy.js --name alpha64-bitquery-dex
npx wrangler secret put BITQUERY_API_KEY --name alpha64-bitquery-dex
```

Paste the Bitquery key only into the Wrangler secret prompt.

## Wire the site

Once deployed, expose only the Worker URL to the browser, not the key:

```js
window.ALPHA64_BITQUERY_PROXY = 'https://alpha64-bitquery-dex.<account>.workers.dev/';
```

The DEX viewer already works without this via Dexscreener/feed fallback. With the proxy configured, `assets/app.js` will request:

```text
<worker-url>?chain=solana&tokenAddress=<ca>&pairAddress=<pair>
```

The Worker calls Bitquery server-side with `Authorization: Bearer <secret>` and returns normalized chart/tape fields.
