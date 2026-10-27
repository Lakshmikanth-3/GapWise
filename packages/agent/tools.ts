// The agent's tools: an allowlist of read-only functions with validated arguments and bounded output.
// No tool writes, signs, moves funds, fetches arbitrary URLs or changes the ratio maths. Each successful call is
// recorded as evidence (sql / tx / source) so the model can cite it by id.
import type { ScanReport } from '../core/report';
import type { ZetarisClient } from '../zetaris/client';
import type { GapMemory } from './memory';
import type { ToolDef } from './llm';
import { analyzeGap, type EvidenceBook, type Evidence, type LockerEvent } from './evidence';

export type TxInfo = Record<string, string | number | boolean | null>;
export type ToolDeps = {
  report: ScanReport;
  /** Local verify-format reports, keyed by 16-hex scan id (content hash prefix). */
  reports: Map<string, ScanReport>;
  zetaris?: ZetarisClient;
  memory?: GapMemory;
  lookupTx?: (chain: 'ethereum' | 'solana', hash: string) => Promise<TxInfo>;
};
export type ToolCallRecord = { tool: string; args: Record<string, unknown>; ok: boolean; ms: number; evidence_id?: string; error?: string };

export const TOOL_DEFS: ToolDef[] = [
  { type: 'function', function: { name: 'runSql', description: 'Read-only SQL (one SELECT/WITH) over the GapWise tables in Zetaris: <schema>.scans, reserves, liabilities, prices, flows, safety_events. Max 500 rows.', parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'], additionalProperties: false } } },
  { type: 'function', function: { name: 'getLatestReport', description: 'Totals, status, timing, hash and reserve rows of the verified scan under investigation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'compareScans', description: 'Exact decomposition of how the gap changed between two scans (16-hex scan ids).', parameters: { type: 'object', properties: { scanA: { type: 'string' }, scanB: { type: 'string' } }, required: ['scanA', 'scanB'], additionalProperties: false } } },
  { type: 'function', function: { name: 'lookupTx', description: 'Read one transaction from Ethereum or Solana (status, block, from/to).', parameters: { type: 'object', properties: { chain: { type: 'string', enum: ['ethereum', 'solana'] }, hash: { type: 'string' } }, required: ['chain', 'hash'], additionalProperties: false } } },
  { type: 'function', function: { name: 'recallMemory', description: 'Search past confirmed findings and earlier investigations (H-MEM).', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
];

const MAX_OUT = 6_000;
const str = (v: unknown, name: string, max = 4000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${name} must be a non-empty string ≤ ${max} chars`); return v.trim(); };
const scanId = (v: unknown, name: string) => { const s = str(v, name, 64).toLowerCase(); if (!/^[0-9a-f]{16}$/.test(s)) throw new Error(`${name} must be a 16-hex scan id`); return s; };

export function reportSummary(r: ScanReport) {
  return {
    scan_id: r.content_sha256.slice(0, 16), report_sha256: r.content_sha256, network: r.network, generated_at: r.generated_at, timing: r.timing,
    reserves_usd: r.reserves.priced_usd, liabilities_usd: r.liabilities.total_usd, ratio: r.result.ratio, status: r.result.status, gap_usd: r.result.gap_usd, gap_pct: r.result.gap_pct,
    liabilities: { account_equity_usd: r.liabilities.account_equity_usd, isolated_margin_usd: r.liabilities.isolated_margin_usd, vault_shares_usd: r.liabilities.vault_shares_usd, staking_rewards_usd: r.liabilities.staking_rewards_usd, accounts_read: r.liabilities.accounts_read, accounts_failed: r.liabilities.accounts_failed.length },
    reserve_rows: r.reserves.rows.map(x => ({ chain: x.chain, address: x.address, asset: x.asset, amount: x.amount, price_usd: x.price_usd, usd: x.usd_value, price_status: x.price_status })),
    unpriced: r.reserves.unpriced,
  };
}

/** Runs one model-requested tool call. Errors come back to the model as data; they never throw out of the loop. */
export async function runTool(name: string, rawArgs: string, deps: ToolDeps, book: EvidenceBook): Promise<{ content: string; record: ToolCallRecord }> {
  const t0 = Date.now();
  let args: Record<string, unknown> = {};
  const done = (ok: boolean, data: unknown, ev?: Evidence, error?: string) => ({
    content: JSON.stringify(ok ? { ok, evidence_id: ev?.id, data } : { ok, error }).slice(0, MAX_OUT),
    record: { tool: name, args, ok, ms: Date.now() - t0, ...(ev ? { evidence_id: ev.id } : {}), ...(error ? { error } : {}) },
  });
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('arguments must be a JSON object');
    switch (name) {
      case 'runSql': {
        if (!deps.zetaris) throw new Error('Zetaris is not configured (ZETARIS_* env); SQL evidence is unavailable');
        const res = await deps.zetaris.runSql(str(args.sql, 'sql'));
        const ev = book.add('sql', res.sql, `Zetaris query · ${res.rows.length} row(s) · ${res.ms} ms`);
        return done(true, res.rows.slice(0, 50), ev);
      }
      case 'getLatestReport': {
        const ev = book.add('source', `report ${deps.report.content_sha256}`, 'Verified scan report (full JSON at /api/report)');
        return done(true, reportSummary(deps.report), ev);
      }
      case 'compareScans': {
        const a = deps.reports.get(scanId(args.scanA, 'scanA')), b = deps.reports.get(scanId(args.scanB, 'scanB'));
        if (!a || !b) throw new Error(`unknown scan id; available: ${[...deps.reports.keys()].join(', ')}`);
        const change = analyzeGap({ report: b, previous: a }).change;
        const ev = book.add('source', `report ${a.content_sha256.slice(0, 16)} → report ${b.content_sha256.slice(0, 16)} · decomposition`, 'Scan comparison');
        return done(true, change, ev);
      }
      case 'lookupTx': {
        const chain = args.chain;
        if (chain !== 'ethereum' && chain !== 'solana') throw new Error('chain must be ethereum or solana');
        const hash = str(args.hash, 'hash', 100);
        if (chain === 'ethereum' ? !/^0x[0-9a-fA-F]{64}$/.test(hash) : !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash)) throw new Error('malformed transaction hash');
        if (!deps.lookupTx) throw new Error('chain RPC not configured');
        const info = await deps.lookupTx(chain, hash);
        const ev = book.add('tx', hash, `${chain} transaction`, chain === 'ethereum' ? `https://etherscan.io/tx/${hash}` : `https://solscan.io/tx/${hash}`);
        return done(true, info, ev);
      }
      case 'recallMemory': {
        if (!deps.memory) throw new Error('memory not available');
        const hits = deps.memory.recall(str(args.query, 'query', 500));
        const ev = book.add('source', `hmem ${hits.map(h => h.id).join(', ') || '(no match)'}`, 'H-MEM recall');
        return done(true, hits, ev);
      }
      default: throw new Error(`unknown tool ${name}`);
    }
  } catch (e) {
    return done(false, null, undefined, (e as Error).message.slice(0, 300));
  }
}

// --- Chain reads used by the orchestrator (same read-only RPC clients as the collectors) ---

export async function ethLookupTx(hash: string): Promise<TxInfo> {
  const { client } = await import('../collectors/ethereum');
  const c = client();
  const [tx, rc] = await Promise.all([c.getTransaction({ hash: hash as `0x${string}` }), c.getTransactionReceipt({ hash: hash as `0x${string}` })]);
  return { from: tx.from, to: tx.to ?? null, block: Number(rc.blockNumber), status: rc.status, logs: rc.logs.length };
}

export async function solLookupTx(sig: string): Promise<TxInfo> {
  const { solConnection } = await import('../collectors/solana');
  const tx = await solConnection().getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  if (!tx) throw new Error('transaction not found');
  return { slot: tx.slot, block_time: tx.blockTime ?? null, error: tx.meta?.err ? JSON.stringify(tx.meta.err) : null, fee_lamports: tx.meta?.fee ?? null };
}

/**
 * Ethereum locker Deposit / Withdraw events (USDC, 6 decimals) between two timestamps. Block range is estimated from
 * the head at 12 s per block with a margin, then filtered by each event's own block timestamp.
 */
export async function ethLockerEvents(fromTs: number, toTs: number): Promise<LockerEvent[]> {
  const [{ client }, { ethSafetyEventsBetween }] = await Promise.all([import('../collectors/ethereum'), import('../collectors/safety')]);
  const head = await client().getBlock();
  const now = Number(head.timestamp) * 1000;
  const blk = (ts: number) => head.number - BigInt(Math.max(0, Math.ceil((now - ts) / 12_000)));
  const from = blk(fromTs) - 50n, to = blk(toTs) + 50n > head.number ? head.number : blk(toTs) + 50n;
  const step = BigInt(Number(process.env.ETH_LOGS_CHUNK ?? 500) || 500);
  const start = to - from > 60_000n ? to - 60_000n : from < 0n ? 0n : from; // bounded: ~8 days of blocks at most
  const evs = [];
  for (let b = start; b <= to; b += step) evs.push(...await ethSafetyEventsBetween(b, b + step - 1n > to ? to : b + step - 1n));
  return evs.filter(e => (e.type === 'Deposit' || e.type === 'Withdraw') && e.ts >= fromTs && e.ts <= toTs && e.args.amount)
    .map(e => ({ chain: 'ethereum', type: e.type, usd: (e.type === 'Withdraw' ? -1 : 1) * Number(e.args.amount) / 1e6, tx: e.tx, ts: e.ts, url: `https://etherscan.io/tx/${e.tx}` }));
}
