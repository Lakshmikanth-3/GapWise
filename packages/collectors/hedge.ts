import { createHmac } from 'node:crypto';
import { NETWORK } from '../core/config';
import type { Reserve } from './types';

/**
 * Strike's market-maker / hedging bot (founder, 23 Oct 18:43 IST): it holds the other side of traders' net positions on
 * external exchanges, so its equity there backs part of what traders are owed. It is NOT an on-chain locker and is shown
 * as its own, clearly labelled reserve line ("known gap, disclosed by Strike").
 * Link to Strike, checkable on-chain: this address sends Deposit transactions into Strike's Ethereum locker for Strike
 * account 019d06a7-bcfb-79a9-857e-cd54172ba144 (e.g. 4,000 / 7,000 / 4,924.40 USDC on 22 Oct, event userID 0x019d06a7…).
 * - Lighter: public API, equity = total_asset_value (includes unrealized PnL).
 * - Aster: read-only API access provided by Strike (ASTER_API_KEY / ASTER_API_SECRET, env only, never in the repo);
 *   equity = totalMarginBalance (wallet + unrealized PnL). Without the keys the Aster line is pending, never guessed.
 */
export const HEDGE_BOT = '0x6139192a58152932e6f8052ef0de2ad197fb1937';
export const HEDGE_STRIKE_ACCOUNT = '019d06a7-bcfb-79a9-857e-cd54172ba144';
export const LIGHTER_API = process.env.LIGHTER_API ?? 'https://mainnet.zklighter.elliot.ai';
export const ASTER_API = process.env.ASTER_API ?? 'https://fapi.asterdex.com';
export const LIGHTER_EQUITY = 'lighter:account-equity-usd';
export const ASTER_EQUITY = 'aster:account-equity-usd';

type LighterAccount = { index: number; total_asset_value?: string; collateral: string };

export async function lighterEquity(fetchFn: typeof fetch = fetch): Promise<number> {
  const res = await fetchFn(`${LIGHTER_API}/api/v1/account?by=l1_address&value=${HEDGE_BOT}`);
  if (!res.ok) throw new Error(`Lighter ${res.status}`);
  const body = await res.json() as { accounts?: LighterAccount[] };
  return (body.accounts ?? []).reduce((s, a) => s + Number(a.total_asset_value ?? a.collateral), 0);
}

/** Signed read of the Aster futures account (Binance-compatible HMAC-SHA256). Returns undefined when no keys are set. */
export async function asterEquity(fetchFn: typeof fetch = fetch, key = process.env.ASTER_API_KEY, secret = process.env.ASTER_API_SECRET, now = Date.now()): Promise<number | undefined> {
  if (!key || !secret) return undefined;
  const q = `timestamp=${now}&recvWindow=10000`;
  const sig = createHmac('sha256', secret).update(q).digest('hex');
  const res = await fetchFn(`${ASTER_API}/fapi/v2/account?${q}&signature=${sig}`, { headers: { 'X-MBX-APIKEY': key } });
  if (!res.ok) throw new Error(`Aster ${res.status}`);
  const body = await res.json() as { totalMarginBalance?: string; totalWalletBalance?: string; totalUnrealizedProfit?: string };
  return body.totalMarginBalance !== undefined ? Number(body.totalMarginBalance) : Number(body.totalWalletBalance ?? 0) + Number(body.totalUnrealizedProfit ?? 0);
}

const row = (asset: string, amount: number, contract: string): Reserve =>
  ({ chain: 'hedge', asset, amount: Math.round(amount * 1e6) / 1e6, contract, holder: HEDGE_BOT });

export async function hedgeReserves(fetchFn: typeof fetch = fetch): Promise<Reserve[]> {
  if (NETWORK !== 'mainnet') return [];
  const [lighter, aster] = await Promise.all([lighterEquity(fetchFn), asterEquity(fetchFn)]);
  const rows = [row('USD equity (Lighter)', lighter, LIGHTER_EQUITY)];
  if (aster !== undefined) rows.push(row('USD equity (Aster)', aster, ASTER_EQUITY));
  return rows;
}

/** Shown on the dashboard and in every report while the bot's funds count as reserves. */
export const HEDGE_NOTE = 'Includes Strike’s market-maker bot on external exchanges (Lighter, Aster), address 0x6139…1937. '
  + 'This is not an on-chain locker: Lighter is read from its public API and Aster through read-only API access provided by Strike. '
  + 'A known gap disclosed by Strike (23 Oct); the bot’s link to Strike is visible on-chain (its deposits into Strike’s Ethereum locker).';
