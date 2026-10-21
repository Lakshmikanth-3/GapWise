import { usdValue } from './ratio';

const ALIASES: Record<string, string> = { WETH: 'ETH', WSOL: 'SOL' };

export type Priced = { asset: string; chain: string; amount: number; usdPrice?: number; usdValue?: number; stale?: boolean };

/** Values each reserve; stablecoins (flagged by contract/policy id, never by name) = 1.00, others via the Strike price map. Unknown assets stay unpriced. */
export function valueReserves<R extends { asset: string; chain: string; amount: number; stable?: boolean }>(
  reserves: R[], prices: Map<string, { usd: number; stale: boolean }>,
): { rows: (R & Priced)[]; totalUsd: number; unpriced: string[]; stalePrices: boolean } {
  const unpriced: string[] = []; let total = 0; let stalePrices = false;
  const rows = reserves.map(r => {
    if (r.stable) { const v = usdValue(r.amount, 1); total += v; return { ...r, usdPrice: 1, usdValue: v }; }
    const p = prices.get(ALIASES[r.asset] ?? r.asset);
    if (!p) { if (r.amount > 0) unpriced.push(`${r.chain}:${r.asset}`); return { ...r }; }
    const v = usdValue(r.amount, p.usd); total += v; stalePrices ||= p.stale;
    return { ...r, usdPrice: p.usd, usdValue: v, stale: p.stale };
  });
  return { rows, totalUsd: Math.round(total * 100) / 100, unpriced, stalePrices };
}
