import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reserve } from '../collectors/types';
import type { Priced } from '../core/valuation';

export type ReserveSnapshotRow = {
  ts: string; chain: string; holder: string | null; asset: string; contract: string | null;
  amount: number; raw_amount: string | null; usd_price: number | null; usd_value: number | null;
  price_source: string; price_status: string;
};

export function toReserveRows(ts: number, rows: (Reserve & Priced)[]): ReserveSnapshotRow[] {
  const iso = new Date(ts).toISOString();
  return rows.map(r => ({
    ts: iso, chain: r.chain, holder: r.holder ?? null, asset: r.asset, contract: r.contract ?? null,
    amount: r.amount, raw_amount: r.raw ?? null, usd_price: r.quote.usd ?? null, usd_value: r.usdValue ?? null,
    price_source: r.quote.source, price_status: r.quote.status,
  }));
}

export interface Store {
  insert(table: string, rows: Record<string, unknown>[]): Promise<void>;
  close(): Promise<void>;
}

/** Local fallback when DATABASE_URL is not set: one JSONL file per table under data/. */
export function jsonlStore(dir = 'data'): Store {
  return {
    async insert(table, rows) {
      const file = `${dir}/${table}.jsonl`;
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    },
    async close() {},
  };
}

export async function pgStore(url: string): Promise<Store> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  return {
    async insert(table, rows) {
      if (!rows.length) return;
      if (!/^[a-z_]+$/.test(table)) throw new Error(`bad table ${table}`);
      const cols = Object.keys(rows[0]);
      const values: unknown[] = [];
      const tuples = rows.map(r => `(${cols.map(c => { values.push(r[c]); return `$${values.length}`; }).join(',')})`);
      await pool.query(`insert into ${table} (${cols.join(',')}) values ${tuples.join(',')}`, values);
    },
    close: () => pool.end(),
  };
}

export function openStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  const url = env.DATABASE_URL;
  return url && !url.endsWith('...') ? pgStore(url) : Promise.resolve(jsonlStore());
}
