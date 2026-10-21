import { usdValue } from './ratio';
import type { GetPrice, PriceQuote } from '../collectors/prices';

export type Priced = { usdValue?: number; quote: PriceQuote };

/** Values each reserve through the pluggable pricer. Unpriced rows are kept, listed separately, never guessed. */
export async function valueReserves<R extends { asset: string; chain: string; amount: number; contract?: string }>(
  reserves: R[], getPrice: GetPrice,
): Promise<{ rows: (R & Priced)[]; pricedUsd: number; unpriced: (R & Priced)[]; stalePrices: boolean }> {
  const rows = await Promise.all(reserves.map(async (r): Promise<R & Priced> => {
    const quote = await getPrice(r);
    return quote.usd === undefined ? { ...r, quote } : { ...r, quote, usdValue: usdValue(r.amount, quote.usd) };
  }));
  const pricedUsd = Math.round(rows.reduce((s, r) => s + (r.usdValue ?? 0), 0) * 100) / 100;
  return {
    rows, pricedUsd,
    unpriced: rows.filter(r => r.usdValue === undefined && r.amount > 0),
    stalePrices: rows.some(r => r.quote.status === 'stale'),
  };
}
