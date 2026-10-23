import { env } from '../core/config';
import type { Chain } from './types';

/**
 * Pluggable pricing. Each adapter claims assets (by contract id, never by display name) and returns a quote.
 * To wire a new official Strike endpoint (e.g. sUSDr / LP prices), add one adapter and put it before `pendingAdapter`.
 */
export type AssetRef = { chain: Chain | string; asset: string; contract?: string };
/** placeholder: a founder-approved stand-in price, always labelled, until the real source is confirmed. */
export type PriceStatus = 'priced' | 'stale' | 'unpriced' | 'placeholder';
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
      const fresh = (fetchedAt > 0 && Date.now() - fetchedAt < ttlMs) || await refresh();
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
  // Testnet deployment only: Circle's official Sepolia test USDC.
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': 'USDC (Sepolia, test)',
};

/** Cardano contract = policy (56 hex) + asset name; match either the full id or the policy. */
const byContract = (table: Record<string, unknown>) => (a: AssetRef) =>
  !!a.contract && (a.contract in table || a.contract.slice(0, 56) in table);

/** USD account equity on an external venue (already in USD; its unrealized PnL is inside the venue's own figure). */
export const usdAccountAdapter: PriceAdapter = {
  name: 'usd-account',
  matches: (a) => a.contract === 'lighter:account-equity-usd' || a.contract === 'aster:account-equity-usd',
  getPrice: async () => ({ usd: 1, source: 'USD account equity on external exchange (Lighter / Aster)', ts: Date.now(), status: 'priced' }),
};

export const pegAdapter: PriceAdapter = {
  name: 'peg',
  matches: byContract(PEGGED_USD),
  getPrice: async () => ({ usd: 1, source: 'peg 1:1 (fiat-redeemable stablecoin)', ts: Date.now(), status: 'priced' }),
};

// Official Strike Credit collateral prices (docs /api/credit/collateral, pointed to by the founder on 22 Oct):
// GET {STRIKE_API}/v2/credit/collateral-assets -> { assets: { sUSDrf: { price, price_available, price_fresh, price_observed_at }, ... } }
export const CREDIT_PATH = '/v2/credit/collateral-assets';
/** On-chain custody asset (contract / Cardano policy) → Strike Credit collateral id (per /v2/credit/settings custody mappings). */
export const CREDIT_ASSET: Record<string, string> = {
  '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae': 'sUSDrf',
  '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d56': 'LP_SUNDAE_USDCx_USDM',
  // Priced per *scaled* unit (includes the Aave liquidity index); the Ethereum collector reports scaled units.
  '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c': 'SCALED_AAVE_V3_ETH_aUSDC',
};

type CreditAsset = { price: string; price_available: boolean; price_fresh: boolean; price_observed_at: number; price_expires_at: number };

/**
 * Strike Credit prices. A price counts as current only if `price_available && price_fresh` and it has not passed
 * `price_expires_at`; otherwise the last good price is returned and flagged `stale`. Nothing is ever assumed to be $1.
 */
export function strikeCreditAdapter(base = env.strikeApi, fetchFn: typeof fetch = fetch, ttlMs = 30_000): PriceAdapter {
  const lastGood = new Map<string, { usd: number; ts: number; expiresAt: number }>();
  const currentIds = new Set<string>();
  let fetchedAt = 0; let inflight: Promise<boolean> | undefined;
  const refresh = () => (inflight ??= (async () => {
    try {
      const res = await fetchFn(`${base}${CREDIT_PATH}`);
      if (!res.ok) throw new Error(`credit ${res.status}`);
      const body = await res.json() as { assets: Record<string, CreditAsset> };
      currentIds.clear();
      for (const [id, a] of Object.entries(body.assets)) {
        const usd = Number(a.price);
        if (a.price_available && a.price_fresh && usd > 0) {
          lastGood.set(id, { usd, ts: a.price_observed_at, expiresAt: a.price_expires_at });
          currentIds.add(id);
        }
      }
      fetchedAt = Date.now(); return true;
    } catch { currentIds.clear(); return false; } finally { inflight = undefined; }
  })());
  const idOf = (a: AssetRef) => (a.contract ? CREDIT_ASSET[a.contract] ?? CREDIT_ASSET[a.contract.slice(0, 56)] : undefined);
  return {
    name: 'strike-credit',
    matches: a => !!idOf(a),
    async getPrice(a) {
      if (fetchedAt === 0 || Date.now() - fetchedAt >= ttlMs) await refresh();
      const id = idOf(a)!;
      const p = lastGood.get(id);
      const source = `${base}${CREDIT_PATH} (${id})`;
      if (!p) return { source, ts: Date.now(), status: 'unpriced' };
      const current = currentIds.has(id) && (!p.expiresAt || Date.now() < p.expiresAt + ttlMs);
      return { usd: p.usd, ts: p.ts, source, status: current ? 'priced' : 'stale' };
    },
  };
}

// GET {STRIKE_API}/v2/credit/settings -> settings.custody_asset_mappings[chain][onchainAsset] = { custody_asset, raw_amount_scale }
export const CREDIT_SETTINGS_PATH = '/v2/credit/settings';
export type CustodyMappings = Record<string, Record<string, { custody_asset: string; raw_amount_scale: number }>>;
/** Our on-chain identifier (contract / Cardano policy) → the key Strike uses in custody_asset_mappings[chain]. */
export const CUSTODY_KEY: Record<string, { chain: string; key: string }> = {
  '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae': { chain: 'cardano', key: 'sUSDrf' },
  '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d56': { chain: 'cardano', key: 'LP_SUNDAE_USDCx_USDM' },
  '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c': { chain: 'ethereum', key: 'AAVE_V3_aUSDC' },
};

export async function creditCustodyMappings(base = env.strikeApi, fetchFn: typeof fetch = fetch): Promise<CustodyMappings> {
  const res = await fetchFn(`${base}${CREDIT_SETTINGS_PATH}`);
  if (!res.ok) throw new Error(`credit settings ${res.status}`);
  return ((await res.json()) as { settings: { custody_asset_mappings: CustodyMappings } }).settings.custody_asset_mappings;
}

/**
 * Re-derives each custody asset's amount from its raw on-chain integer using Strike's raw_amount_scale, and checks the
 * price id we use matches Strike's custody_asset. Rows Strike does not map are returned unchanged.
 */
export function applyCustodyScale<R extends { contract?: string; raw?: string; amount: number; decimals?: number }>(rows: R[], mappings: CustodyMappings): R[] {
  return rows.map(r => {
    if (!r.contract || r.raw === undefined) return r;
    const ref = CUSTODY_KEY[r.contract] ?? CUSTODY_KEY[r.contract.slice(0, 56)];
    const m = ref && mappings[ref.chain]?.[ref.key];
    if (!m) return r;
    const expectedId = CREDIT_ASSET[r.contract] ?? CREDIT_ASSET[r.contract.slice(0, 56)];
    if (expectedId && m.custody_asset !== expectedId) throw new Error(`custody mapping changed: ${ref.key} → ${m.custody_asset} (expected ${expectedId})`);
    return { ...r, amount: Number(r.raw) / 10 ** m.raw_amount_scale, decimals: m.raw_amount_scale };
  });
}

/** Assets with no official Strike price source (not a Credit collateral asset). Never priced by us. */
export const PENDING_PRICE: Record<string, string> = {
  'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880': 'iUSD',
};

export const pendingAdapter: PriceAdapter = {
  name: 'pending',
  matches: byContract(PENDING_PRICE),
  getPrice: async () => ({ source: 'pending: no official Strike price source for this asset', ts: Date.now(), status: 'unpriced' }),
};

/**
 * iUSD counts as a reserve (founder, 23 Oct); its price source is still being asked, so it is valued at a labelled $1
 * placeholder until confirmed. Never presented as a market price.
 */
export const PLACEHOLDER_PRICE: Record<string, { usd: number; reason: string }> = {
  'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880': { usd: 1, reason: 'iUSD: placeholder $1 until Strike confirms the price source' },
};
export const placeholderAdapter: PriceAdapter = {
  name: 'placeholder',
  matches: byContract(PLACEHOLDER_PRICE),
  getPrice: async a => { const p = PLACEHOLDER_PRICE[a.contract!] ?? PLACEHOLDER_PRICE[a.contract!.slice(0, 56)]; return { usd: p.usd, source: `placeholder: ${p.reason}`, ts: Date.now(), status: 'placeholder' }; },
};

export const unknownAdapter: PriceAdapter = {
  name: 'unknown',
  matches: () => true,
  getPrice: async () => ({ source: 'unknown asset: no price source', ts: Date.now(), status: 'unpriced' }),
};

export type GetPrice = (a: AssetRef) => Promise<PriceQuote>;

/** First matching adapter wins; `unknownAdapter` always terminates the chain. */
export function createPricer(adapters: PriceAdapter[] = [strikeFeedAdapter(), strikeCreditAdapter(), usdAccountAdapter, pegAdapter, placeholderAdapter, pendingAdapter]): GetPrice {
  const chain = [...adapters, unknownAdapter];
  return a => chain.find(x => x.matches(a))!.getPrice(a);
}

/**
 * One price snapshot for a whole scan: each source is fetched once (on first use) and never refreshed, so every
 * reserve row in the scan is valued at the same instant. `takenAt` is recorded next to the liability scan window.
 */
export function createSnapshotPricer(base = env.strikeApi): { getPrice: GetPrice; takenAt: () => number | undefined } {
  let takenAt: number | undefined;
  const inner = createPricer([strikeFeedAdapter(base, fetch, Infinity), strikeCreditAdapter(base, fetch, Infinity), usdAccountAdapter, pegAdapter, placeholderAdapter, pendingAdapter]);
  return { getPrice: a => { takenAt ??= Date.now(); return inner(a); }, takenAt: () => takenAt };
}
