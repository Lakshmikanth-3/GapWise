// The six GapWise tables, built deterministically from a verify-format scan report (plus flow checks and safety
// events when the engine has them). Same rows whether they go to Zetaris or stay local.
import type { ScanReport } from '../core/report';
import type { ZetarisClient } from './client';

export type Row = Record<string, string | number | boolean | null>;
export type GapwiseTables = { scans: Row[]; reserves: Row[]; liabilities: Row[]; prices: Row[]; flows: Row[]; safety_events: Row[] };

/** Stable scan id: the first 16 hex chars of the report's content hash (anyone re-hashing the report gets the same id). */
export const scanIdOf = (r: Pick<ScanReport, 'content_sha256'>) => r.content_sha256.slice(0, 16);

export type FlowInput = { day: string; chain: string; reportedIn: number; onchainIn: number; reportedOut: number; onchainOut: number };
export type SafetyInput = { chain: string; type: string; detail: string; tx: string; ts: number };

export function buildTables(r: ScanReport, extra: { flows?: FlowInput[]; safety?: SafetyInput[] } = {}): GapwiseTables {
  const scan_id = scanIdOf(r);
  const ts = r.timing.price_snapshot_at ?? r.generated_at;
  const sharesBy = new Map<string, number>();
  for (const s of r.liabilities.vault_shares) sharesBy.set(s.address.toLowerCase(), (sharesBy.get(s.address.toLowerCase()) ?? 0) + Number(s.current_equity));
  const prices = new Map<string, Row>();
  for (const x of r.reserves.rows) if (x.price_usd !== null) prices.set(x.asset, { scan_id, asset: x.asset, price: x.price_usd, source: x.price_source, ts: x.price_ts ? new Date(x.price_ts).toISOString() : ts });
  return {
    scans: [{
      scan_id, reserves_usd: r.reserves.priced_usd, liabilities_usd: r.liabilities.total_usd, ratio: r.result.ratio, gap_usd: r.result.gap_usd,
      status: r.result.status, ts, report_sha256: r.content_sha256, accounts_read: r.liabilities.accounts_read,
    }],
    reserves: r.reserves.rows.map(x => ({
      scan_id, chain: x.chain, address: x.address, asset: x.asset, raw_amount: x.raw, decimals: x.decimals,
      amount: x.amount, price: x.price_usd, usd: x.usd_value, ts,
    })),
    liabilities: r.liabilities.accounts.map(a => ({
      scan_id, account_id: a.account_id, sub_account: a.sub_account,
      equity: Number(a.wallet_balance) + Number(a.unrealized_pnl), unrealized_pnl: Number(a.unrealized_pnl),
      margin_balance: Number(a.margin_balance), vault_shares: 0, staking: Number(a.stakingRewardBalance ?? 0), ts,
    })).concat([...sharesBy].map(([addr, usd]) => ({
      // Depositor vault shares are keyed by wallet address in Strike's API (not by account id): one row per depositor.
      scan_id, account_id: `vault-depositor:${addr}`, sub_account: false, equity: 0, unrealized_pnl: 0, margin_balance: 0, vault_shares: usd, staking: 0, ts,
    }))),
    prices: [...prices.values()],
    flows: (extra.flows ?? []).map(f => ({ day: f.day, chain: f.chain, reported_usd: f.reportedIn - f.reportedOut, onchain_usd: f.onchainIn - f.onchainOut, reported_in: f.reportedIn, onchain_in: f.onchainIn, reported_out: f.reportedOut, onchain_out: f.onchainOut })),
    safety_events: (extra.safety ?? []).map(e => ({ chain: e.chain, type: e.type, detail: e.detail, tx_hash: e.tx, ts: new Date(e.ts).toISOString() })),
  };
}

const lit = (v: Row[string]) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL') : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`);

/** INSERT statements (batched) for one table. Values are escaped literals; column names come from our own row builders. */
export function insertStatements(schema: string, table: keyof GapwiseTables, rows: Row[], batch = 200): string[] {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += batch) {
    out.push(`INSERT INTO ${schema}.${table} (${cols.join(', ')}) VALUES ${rows.slice(i, i + batch).map(r => `(${cols.map(c => lit(r[c])).join(', ')})`).join(', ')}`);
  }
  return out;
}

/**
 * Publish one scan to Zetaris. Requires the six tables to exist in ZETARIS_SCHEMA (docs/zetaris/schema.sql) on a
 * writable data source registered in Zetaris. Flow and safety rows are keyed by day/tx, so the caller passes only new ones.
 */
export async function publishScan(z: ZetarisClient, t: GapwiseTables): Promise<{ statements: number; rows: number }> {
  let statements = 0, rows = 0;
  for (const table of Object.keys(t) as (keyof GapwiseTables)[]) {
    for (const sql of insertStatements(z.cfg.schema, table, t[table])) { await z.exec(sql); statements++; }
    rows += t[table].length;
  }
  return { statements, rows };
}
