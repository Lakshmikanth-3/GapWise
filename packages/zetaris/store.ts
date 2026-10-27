// GapWise store: a Postgres database registered in Zetaris as the datasource `gapwise` (CREATE DATASOURCE + REGISTER
// DATASOURCE TABLES). GapWise writes each scan here; everything the agent reads goes through Zetaris SQL
// (`gapwise.scans`, `gapwise.reserves`, …). Zetaris Lightning has no INSERT, so writes go to the source it federates.
import pg from 'pg';
import { insertStatements, type GapwiseTables } from './tables';

export const STORE_DDL = [
  'CREATE TABLE IF NOT EXISTS scans (scan_id TEXT PRIMARY KEY, reserves_usd DOUBLE PRECISION, liabilities_usd DOUBLE PRECISION, ratio DOUBLE PRECISION, gap_usd DOUBLE PRECISION, status TEXT, ts TEXT, report_sha256 TEXT, accounts_read INT)',
  'CREATE TABLE IF NOT EXISTS reserves (scan_id TEXT, chain TEXT, address TEXT, asset TEXT, raw_amount TEXT, decimals INT, amount DOUBLE PRECISION, price DOUBLE PRECISION, usd DOUBLE PRECISION, ts TEXT)',
  'CREATE TABLE IF NOT EXISTS liabilities (scan_id TEXT, account_id TEXT, sub_account BOOLEAN, equity DOUBLE PRECISION, unrealized_pnl DOUBLE PRECISION, margin_balance DOUBLE PRECISION, vault_shares DOUBLE PRECISION, staking DOUBLE PRECISION, ts TEXT)',
  'CREATE TABLE IF NOT EXISTS prices (scan_id TEXT, asset TEXT, price DOUBLE PRECISION, source TEXT, ts TEXT)',
  'CREATE TABLE IF NOT EXISTS flows (day TEXT, chain TEXT, reported_usd DOUBLE PRECISION, onchain_usd DOUBLE PRECISION, reported_in DOUBLE PRECISION, onchain_in DOUBLE PRECISION, reported_out DOUBLE PRECISION, onchain_out DOUBLE PRECISION)',
  'CREATE TABLE IF NOT EXISTS safety_events (chain TEXT, type TEXT, detail TEXT, tx_hash TEXT, ts TEXT)',
];

export const storeUrl = (env: NodeJS.ProcessEnv = process.env) => env.GAPWISE_STORE_URL || undefined;

export async function withStore<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000, statement_timeout: 60_000 });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Writes one scan's tables in a transaction. Re-publishing a scan replaces its rows (idempotent by scan_id). */
export async function publishScan(url: string, t: GapwiseTables): Promise<{ statements: number; rows: number; scan_id: string | null }> {
  const scanId = (t.scans[0]?.scan_id as string | undefined) ?? null;
  return withStore(url, async c => {
    let statements = 0, rows = 0;
    await c.query('BEGIN');
    try {
      if (scanId) for (const table of ['scans', 'reserves', 'liabilities', 'prices'] as const) await c.query(`DELETE FROM ${table} WHERE scan_id = $1`, [scanId]);
      for (const table of Object.keys(t) as (keyof GapwiseTables)[]) {
        for (const sql of insertStatements('public', table, t[table])) { await c.query(sql); statements++; }
        rows += t[table].length;
      }
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; }
    return { statements, rows, scan_id: scanId };
  });
}
