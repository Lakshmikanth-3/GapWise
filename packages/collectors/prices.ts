import { env } from '../core/config';

// Confirmed from docs.strikefinance.org/api/market/rest-api/prices.md:
// GET {STRIKE_API}/price/v2/premiumIndex (no symbol = all) -> [{ symbol: "ADA-USD", markPrice, indexPrice, time }]
export const PRICE_PATH = '/price/v2/premiumIndex';

export type Price = { usd: number; ts: number; stale: boolean; source: string };
type PremiumIndex = { symbol: string; indexPrice: string; markPrice: string; time: number };

export function createPriceFeed(base = env.strikeApi, fetchFn: typeof fetch = fetch) {
  const lastGood = new Map<string, Price>();
  return async function prices(): Promise<Map<string, Price>> {
    const out = new Map<string, Price>();
    try {
      const res = await fetchFn(`${base}${PRICE_PATH}`);
      if (!res.ok) throw new Error(`price ${res.status}`);
      const rows = (await res.json()) as PremiumIndex[];
      for (const r of rows) {
        const usd = Number(r.indexPrice);
        if (!(usd > 0)) continue;
        const p = { usd, ts: r.time || Date.now(), stale: false, source: `${base}${PRICE_PATH}` };
        const sym = r.symbol.replace(/-USD$/, '');
        out.set(sym, p); lastGood.set(sym, p);
      }
    } catch {
      for (const [k, v] of lastGood) out.set(k, { ...v, stale: true });
    }
    return out;
  };
}
