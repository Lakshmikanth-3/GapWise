import { env } from '../core/config';
import type { Chain } from './types';

/**
 * Pluggable pricing. Each adapter claims assets (by contract id, never by display name) and returns a quote.
 * To wire a new official Strike endpoint (e.g. sUSDr / LP prices), add one adapter and put it before `pendingAdapter`.
 */
export type AssetRef = { chain: Chain | string; asset: string; contract?: string };
export type PriceStatus = 'priced' | 'stale' | 'unpriced';
export type PriceQuote = { usd?: number; source: string; ts: number; status: PriceStatus };
export interface PriceAdapter {
  name: string;
  matches(a: AssetRef): boolean;
  getPrice(a: AssetRef): Promise<PriceQuote>;
}

// Confirmed from docs.strikefinance.org/api/market/rest-api/prices.md:
// GET {STRIKE_API}/price/v2/premiumIndex (no symbol = all) -> [{ symbol: "ADA-USD", markPrice, indexPrice, time }]
export const PRICE_PATH = '/price/v2/premiumIndex';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const NATIVE: Record<string, string> = { ADA: 'ADA', ETH: 'ETH', SOL: 'SOL' };

/** Strike index price for native coins (and WETH by contract). Falls back to last good price, marked stale. */
export function strikeFeedAdapter(base = env.strikeApi, fetchFn: typeof fetch = fetch, ttlMs = 30_000): PriceAdapter {
  const lastGood = new Map<string, { usd: number; ts: number }>();
  let fetchedAt = 0; let inflight: Promise<boolean> | undefined;
  const refresh = () => (inflight ??= (async () => {
    try {
      const res = await fetchFn(`${base}${PRICE_PATH}`);
      if (!res.ok) throw new Error(`price ${res.status}`);
      for (const r of (await res.json()) as { symbol: string; indexPrice: string; time: number }[]) {
        const usd = Number(r.indexPrice);
        if (usd > 0) lastGood.set(r.symbol.replace(/-USD$/, ''), { usd, ts: r.time || Date.now() });
      }
      fetchedAt = Date.now(); return true;
    } catch { return false; } finally { inflight = undefined; }
  })());
  const symbol = (a: AssetRef) => (!a.contract ? NATIVE[a.asset] : a.contract === WETH ? 'ETH' : undefined);
  return {
    name: 'strike-feed',
    matches: a => !!symbol(a),
    async getPrice(a) {
      const fresh = Date.now() - fetchedAt < ttlMs || await refresh();
      const p = lastGood.get(symbol(a)!);
      const source = `${base}${PRICE_PATH}`;
      if (!p) return { source, ts: Date.now(), status: 'unpriced' };
      return { usd: p.usd, ts: p.ts, source, status: fresh ? 'priced' : 'stale' };
    },
  };
}

/**
 * Fiat-redeemable USD stablecoins, keyed by contract / mint / Cardano policy. Strike's feed has no stablecoin
 * symbols, so these use the 1:1 redemption peg and every quote says so. TODO: swap for a market source if confirmed.
 */
export const PEGGED_USD: Record<string, string> = {
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC (Ethereum)',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT (Ethereum)',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC (Solana)',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT (Solana)',
  '1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34': 'USDCx (Cardano)',
  'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad': 'USDM (Cardano)',
};

/** Cardano contract = policy (56 hex) + asset name; match either the full id or the policy. */
const byContract = (table: Record<string, unknown>) => (a: AssetRef) =>
  !!a.contract && (a.contract in table || a.contract.slice(0, 56) in table);

export const pegAdapter: PriceAdapter = {
  name: 'peg',
  matches: byContract(PEGGED_USD),
  getPrice: async () => ({ usd: 1, source: 'peg 1:1 (fiat-redeemable stablecoin)', ts: Date.now(), status: 'priced' }),
};

/** Assets with an official Strike price API that is not public yet. Never priced by us. */
export const PENDING_PRICE: Record<string, string> = {
  '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae': 'sUSDr',
  'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880': 'iUSD',
  '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d56': 'LP USDCx/USDM',
};

// TODO(founder): replace with the official Strike price adapter for sUSDr / iUSD / LP once documented.
export const pendingAdapter: PriceAdapter = {
  name: 'pending',
  matches: byContract(PENDING_PRICE),
  getPrice: async () => ({ source: 'pending: official Strike price API not yet public', ts: Date.now(), status: 'unpriced' }),
};

export const unknownAdapter: PriceAdapter = {
  name: 'unknown',
  matches: () => true,
  getPrice: async () => ({ source: 'unknown asset: no price source', ts: Date.now(), status: 'unpriced' }),
};

export type GetPrice = (a: AssetRef) => Promise<PriceQuote>;

/** First matching adapter wins; `unknownAdapter` always terminates the chain. */
export function createPricer(adapters: PriceAdapter[] = [strikeFeedAdapter(), pegAdapter, pendingAdapter]): GetPrice {
  const chain = [...adapters, unknownAdapter];
  return a => chain.find(x => x.matches(a))!.getPrice(a);
}
