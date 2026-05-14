// ALPHA64 Bitquery DEX proxy for Cloudflare Workers.
// Do NOT put BITQUERY_API_KEY in the static site. Add it as a Worker secret:
//   npx wrangler secret put BITQUERY_API_KEY
// Then set window.ALPHA64_BITQUERY_PROXY on the site to this worker URL.

const BITQUERY_ENDPOINT = 'https://streaming.bitquery.io/graphql';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'public, max-age=20',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', ...cors},
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
    const url = new URL(request.url);
    const tokenAddress = (url.searchParams.get('tokenAddress') || '').trim();
    const pairAddress = (url.searchParams.get('pairAddress') || '').trim();
    const chain = (url.searchParams.get('chain') || 'solana').toLowerCase();
    if (!env.BITQUERY_API_KEY) return json({error: 'BITQUERY_API_KEY worker secret missing'}, 500);
    if (!tokenAddress && !pairAddress) return json({error: 'tokenAddress or pairAddress required'}, 400);

    // Bitquery schema names change by product tier/network. This query is intentionally
    // small: recent Solana DEX trades for one token/pair, enough to animate a mini chart.
    const query = `
      query Alpha64DexTape($token: String!, $since: DateTime!) {
        Solana {
          DEXTrades(
            limit: {count: 48}
            orderBy: {descending: Block_Time}
            where: {
              Block: {Time: {since: $since}}
              Trade: {Currency: {MintAddress: {is: $token}}}
            }
          ) {
            Block { Time }
            Trade {
              PriceInUSD
              Amount
              Currency { Symbol MintAddress }
              Dex { ProtocolName }
            }
          }
        }
      }`;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();
    const upstream = await fetch(BITQUERY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${env.BITQUERY_API_KEY}`,
      },
      body: JSON.stringify({query, variables: {token: tokenAddress || pairAddress, since}}),
    });
    const text = await upstream.text();
    let raw;
    try { raw = JSON.parse(text); } catch (_) { return json({error: 'Bitquery non-json response', status: upstream.status}, 502); }
    if (!upstream.ok || raw.errors) return json({error: 'Bitquery query failed', status: upstream.status, details: raw.errors || raw}, 502);

    const trades = raw?.data?.Solana?.DEXTrades || [];
    const points = trades.map(t => Number(t?.Trade?.PriceInUSD || 0)).filter(Boolean).reverse();
    const last = trades[0]?.Trade || {};
    const firstPrice = points[0] || 0;
    const lastPrice = points[points.length - 1] || firstPrice;
    const change = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    return json({
      source: 'bitquery live',
      chain,
      tokenAddress,
      pairAddress,
      price: lastPrice || Number(last.PriceInUSD || 0),
      liquidity: 0,
      volume24: trades.reduce((a, t) => a + Number(t?.Trade?.Amount || 0), 0),
      tx5: trades.length,
      tx1h: trades.length,
      change5: change,
      change1h: change,
      change24: change,
      points,
    });
  }
};
