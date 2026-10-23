import { NETWORK } from '../core/config';
import type { Reserve } from './types';

/**
 * Strike's hedging bot (founder, 23 Oct 15:31 IST): it holds the other side of traders' net positions, with its balance
 * on Lighter and Aster. Its account equity there is part of what backs traders' unrealized PnL, so it counts as a reserve.
 * Lighter is read from its public API (equity = total_asset_value, which includes unrealized PnL).
 * Aster has no public per-account read (signed keys only), so it is listed as a pending note, never guessed.
 */
export const HEDGE_BOT = '0x6139192a58152932e6f8052ef0de2ad197fb1937';
export const LIGHTER_API = process.env.LIGHTER_API ?? 'https://mainnet.zklighter.elliot.ai';
export const LIGHTER_EQUITY = 'lighter:account-equity-usd';

type LighterAccount = { index: number; total_asset_value?: string; collateral: string };

export async function hedgeReserves(fetchFn: typeof fetch = fetch): Promise<Reserve[]> {
  if (NETWORK !== 'mainnet') return [];
  const url = `${LIGHTER_API}/api/v1/account?by=l1_address&value=${HEDGE_BOT}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Lighter ${res.status}`);
  const body = await res.json() as { accounts?: LighterAccount[] };
  const equity = (body.accounts ?? []).reduce((s, a) => s + Number(a.total_asset_value ?? a.collateral), 0);
  return [{ chain: 'hedge', asset: 'USD equity (Lighter)', amount: Math.round(equity * 1e6) / 1e6, contract: LIGHTER_EQUITY, holder: HEDGE_BOT }];
}
