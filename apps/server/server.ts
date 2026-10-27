// GapWise server: serves the public pages and a read-only JSON API over the engine's state.
// Read-only by design: no endpoint moves funds or receives private keys (My Safety talks to Strike from the browser).
// The one POST, /api/why/run, only starts a read-only investigation of the latest scan (one at a time, rate-limited).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Engine } from './engine';
import { env } from '../../packages/core/config';
import { publicConfig, snapshot } from './snapshot';

const PORT = Number(process.env.PORT ?? 8787);
const RUN_COOLDOWN_MS = Number(process.env.GAPWISE_RUN_COOLDOWN_MS ?? 60_000);
let lastRun = 0;
const WEB = join(process.cwd(), 'apps', 'web');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGES: Record<string, string> = { '/': 'index.html', '/dashboard': 'dashboard.html', '/my-safety': 'my-safety.html', '/me': 'my-safety.html', '/how': 'how.html', '/legal': 'legal.html' };

async function main() {
  const engine = new Engine();
  await engine.init();
  if (!process.argv.includes('--no-engine')) engine.start();

  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'POST' && url.pathname === '/api/why/run') {
        if (engine.investigating) return json(409, { error: 'an investigation is already running', investigating: engine.investigating });
        if (Date.now() - lastRun < RUN_COOLDOWN_MS) return json(429, { error: `one investigation per ${RUN_COOLDOWN_MS / 1000} s` });
        if (!engine.lastReport) return json(503, { error: 'no scan yet' });
        lastRun = Date.now();
        void engine.investigateNow('manual').catch(e => console.error('[investigator]', (e as Error).message));
        return json(202, { started: true, investigating: engine.investigating ?? null });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'read-only' });
      if (url.pathname === '/api/why') return engine.investigation ? json(200, { ...engine.investigation, investigating: engine.investigating ?? null }) : json(404, { error: 'no investigation yet', investigating: engine.investigating ?? null });
      if (url.pathname === '/api/why/status') return json(200, await engine.whyStatus());
      if (url.pathname === '/api/state') return json(200, snapshot(engine.state));
      if (url.pathname === '/api/history') return json(200, engine.state.history);
      if (url.pathname === '/api/report') return engine.lastReport ? json(200, engine.lastReport) : json(503, { error: 'no scan yet' });
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
  }).listen(PORT, () => console.log(`GapWise on http://localhost:${PORT}`));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('apps/server/server.ts')) main();
