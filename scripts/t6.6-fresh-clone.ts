// T6.6: a fresh clone + `npm install` + `npm run verify` completes with no keys and matches the dashboard's latest scan
// (within price-movement tolerance). Usage: npm run test:t6.6 [-- <repo-url-or-path>]
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] ?? 'https://github.com/Lakshmikanth-3/ZeroGap.git';
const dashboard = process.env.ZEROGAP_URL ?? 'https://zerogap-strike.vercel.app';
// Reserves and liabilities move between scans (prices, deposits, withdrawals); the dashboard scan can be up to ~1 h old.
const TOLERANCE = Number(process.env.T66_TOLERANCE ?? 0.03); // 3% relative on each side and on the ratio

const dir = mkdtempSync(join(tmpdir(), 'zerogap-t66-'));
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
};

try {
  run('git', ['clone', '--depth=1', repo, 'zerogap'], dir);
  const app = join(dir, 'zerogap');
  run('npm', ['ci', '--no-audit', '--no-fund'], app);
  // No keys at all: only public endpoints (documented free-tier keys are optional).
  const env = { ...process.env, ETH_RPC_URL: '', SOLANA_RPC_URL: '', BLOCKFROST_PROJECT_ID: '', DATABASE_URL: '', TELEGRAM_BOT_TOKEN: '', ZEROGAP_REPORTS_DIR: 'reports' };
  run('npm', ['run', 'verify'], app, env);
  const file = readdirSync(join(app, 'reports')).find(f => f.endsWith('.json'))!;
  const mine = JSON.parse(readFileSync(join(app, 'reports', file), 'utf8'));
  const live = await (await fetch(`${dashboard}/api/state`)).json() as { ratio?: { reservesUsd: number; liabilitiesUsd: number; published: { ratio?: number } }; now: number };
  if (!live.ratio?.published.ratio) throw new Error('dashboard has no published ratio');
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  const checks = {
    reserves: rel(mine.reserves.priced_usd, live.ratio.reservesUsd),
    liabilities: rel(mine.liabilities.total_usd, live.ratio.liabilitiesUsd),
    ratio: rel(mine.result.ratio, live.ratio.published.ratio),
  };
  console.log('\nT6.6 comparison (fresh clone vs dashboard):');
  console.log(`  reserves    ${mine.reserves.priced_usd.toFixed(2)} vs ${live.ratio.reservesUsd.toFixed(2)} → ${(checks.reserves * 100).toFixed(3)}%`);
  console.log(`  liabilities ${mine.liabilities.total_usd.toFixed(2)} vs ${live.ratio.liabilitiesUsd.toFixed(2)} → ${(checks.liabilities * 100).toFixed(3)}%`);
  console.log(`  ratio       ${mine.result.ratio.toFixed(6)} vs ${live.ratio.published.ratio.toFixed(6)} → ${(checks.ratio * 100).toFixed(3)}%`);
  console.log(`  dashboard scan age ${Math.round((Date.now() - live.now) / 60000)} min · tolerance ${(TOLERANCE * 100).toFixed(1)}%`);
  const failed = Object.entries(checks).filter(([, v]) => v > TOLERANCE);
  if (failed.length) throw new Error(`T6.6 FAILED: ${failed.map(([k]) => k).join(', ')} outside tolerance`);
  console.log('T6.6 PASSED');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
