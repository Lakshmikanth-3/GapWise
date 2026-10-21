// ZeroGap server: serves the public pages and a read-only JSON API over the engine's state.
// Read-only by design: no endpoint moves funds or receives private keys (My Safety talks to Strike from the browser).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Engine } from './engine';
import { LOCKERS, EXPLORERS, env } from '../../packages/core/config';

const PORT = Number(process.env.PORT ?? 8787);
const WEB = join(process.cwd(), 'apps', 'web');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGES: Record<string, string> = { '/': 'index.html', '/dashboard': 'dashboard.html', '/my-safety': 'my-safety.html', '/how': 'how.html' };

export function publicConfig(e: NodeJS.ProcessEnv = process.env) {
  return {
    strikeApi: e.STRIKE_API ?? 'https://api.strikefinance.org',
    strikeTestnetApi: e.STRIKE_TESTNET_API ?? 'https://api-v2-testnet.strikefinance.org',
    builderCode: e.STRIKE_BUILDER_CODE ?? null,
    builderFeeBps: Number(e.STRIKE_BUILDER_FEE_BPS ?? 0),
    telegramChannel: e.TELEGRAM_CHANNEL_URL ?? null,
    github: 'https://github.com/Lakshmikanth-3/ZeroGap',
    lockers: {
      ethereum: { address: LOCKERS.ethereum, url: EXPLORERS.ethereum(LOCKERS.ethereum) },
      solana: { address: LOCKERS.solana, url: EXPLORERS.solana(LOCKERS.solana) },
      cardano: LOCKERS.cardano.map(a => ({ address: a, url: EXPLORERS.cardano(a) })),
    },
  };
}

/** The public snapshot: everything a page needs, each block with its own timestamp and error (if any). */
export function snapshot(engine: Engine) {
  const s = engine.state;
  return {
    now: Date.now(), startedAt: s.startedAt,
    reserves: s.reserves && {
      ts: s.reserves.ts, pricedUsd: s.reserves.value.pricedUsd, stalePrices: s.reserves.value.stalePrices,
      rows: s.reserves.value.rows.map(r => ({ chain: r.chain, holder: r.holder, asset: r.asset, contract: r.contract, amount: r.amount, usdValue: r.usdValue, price: r.quote })),
      unpriced: s.reserves.value.unpriced.map(r => ({ chain: r.chain, asset: r.asset, amount: r.amount, source: r.quote.source })),
    },
    liabilities: s.liabilities && (({ failed, negative, ...rest }) => ({ ...rest, failedCount: failed.length, negativeCount: negative.length }))({ ...s.liabilities.value, ts: s.liabilities.ts }),
    ratio: s.ratio && { ...s.ratio.value, ts: s.ratio.ts },
    safety: s.safety && { ...s.safety.value, openItems: undefined },
    events: s.events.slice(-50).reverse(),
    flows: s.flows && { ...s.flows.value, ts: s.flows.ts },
    feed: s.feed.slice(0, 30),
    alerts: s.alerts.slice(0, 30),
    errors: s.errors,
  };
}

async function main() {
  const engine = new Engine();
  await engine.init();
  if (!process.argv.includes('--no-engine')) engine.start();

  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'read-only' });
      if (url.pathname === '/api/state') return json(200, snapshot(engine));
      if (url.pathname === '/api/history') return json(200, engine.state.history);
      if (url.pathname === '/api/config') return json(200, publicConfig());
      if (url.pathname === '/api/health') return json(200, { ok: true, startedAt: engine.state.startedAt, errors: engine.state.errors, strikeApi: env.strikeApi });
      if (url.pathname === '/vendor/nacl-fast.min.js') { res.writeHead(200, { 'content-type': TYPES['.js'] }); return res.end(await readFile(join(process.cwd(), 'node_modules', 'tweetnacl', 'nacl-fast.min.js'))); }
      const rel = PAGES[url.pathname] ?? normalize(url.pathname).replace(/^([/\\])+/, '');
      if (rel.includes('..')) return json(400, { error: 'bad path' });
      const body = await readFile(join(WEB, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      json(404, { error: 'not found' });
    }
  }).listen(PORT, () => console.log(`ZeroGap on http://localhost:${PORT}`));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('apps/server/server.ts')) main();
