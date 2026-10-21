import { usdValue } from './ratio';

/**
 * Fiat-redeemable USD stablecoins, keyed by contract / mint / Cardano policy (never by display name).
 * These are valued at the 1:1 redemption peg and every row says so (`priceSource: 'peg'`), because Strike's
 * price feed has no stablecoin symbols. Yield-bearing or synthetic tokens (sUSDr, iUSD, LP tokens) are NOT
 * here; they have their own prices and stay "unpriced" until the founder confirms the source.
 * TODO: replace the peg with a market price once a stablecoin price source is confirmed.
 */
export const PEGGED_USD: Record<string, string> = {
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC (Ethereum)',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT (Ethereum)',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC (Solana)',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT (Solana)',
  '1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34': 'USDCx (Cardano)',
  'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad': 'USDM (Cardano)',
};

/** Native coins / wrapped natives priced from the Strike feed symbol. */
const FEED_SYMBOL: Record<string, string> = { ADA: 'ADA', ETH: 'ETH', SOL: 'SOL', WETH: 'ETH' };
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function pegKey(contract?: string): string | undefined {
  if (!contract) return undefined;
  if (PEGGED_USD[contract]) return contract;
  const policy = contract.slice(0, 56); // Cardano: policy id + asset name hex
  return PEGGED_USD[policy] ? policy : undefined;
}

export type PriceSource = 'strike-feed' | 'peg';
export type Priced = { usdPrice?: number; usdValue?: number; priceSource?: PriceSource; stale?: boolean };

export function valueReserves<R extends { asset: string; chain: string; amount: number; contract?: string }>(
  reserves: R[], prices: Map<string, { usd: number; stale: boolean }>,
): { rows: (R & Priced)[]; pricedUsd: number; unpriced: (R & Priced)[]; stalePrices: boolean } {
  let total = 0; let stalePrices = false;
  const rows = reserves.map((r): R & Priced => {
    if (pegKey(r.contract)) { const v = usdValue(r.amount, 1); total += v; return { ...r, usdPrice: 1, usdValue: v, priceSource: 'peg' }; }
    // Native coins have no contract; WETH is matched by its contract, not its name.
    const sym = !r.contract ? FEED_SYMBOL[r.asset] : r.contract === WETH ? 'ETH' : undefined;
    const p = sym ? prices.get(sym) : undefined;
    if (!p) return { ...r };
    const v = usdValue(r.amount, p.usd); total += v; stalePrices ||= p.stale;
    return { ...r, usdPrice: p.usd, usdValue: v, priceSource: 'strike-feed', stale: p.stale };
  });
  return { rows, pricedUsd: Math.round(total * 100) / 100, unpriced: rows.filter(r => r.usdValue === undefined && r.amount > 0), stalePrices };
}
