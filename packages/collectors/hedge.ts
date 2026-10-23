import { NETWORK } from '../core/config';
import type { Reserve } from './types';

/**
 * Strike's market-maker / hedging bot (founder, 23 Oct 18:43 IST): it holds the other side of traders' net positions on
 * external exchanges, so its equity there backs part of what traders are owed. It is NOT an on-chain locker and is shown
 * as its own, clearly labelled reserve line ("known gap, disclosed by Strike").
 * Link to Strike, checkable on-chain: this address sends Deposit transactions into Strike's Ethereum locker for Strike
 * account 019d06a7-bcfb-79a9-857e-cd54172ba144 (e.g. 4,000 / 7,000 / 4,924.40 USDC on 22 Oct, event userID 0x019d06a7…).
 * - Lighter: public API, equity = total_asset_value (includes unrealized PnL).
 * - Aster: read-only API wallet provided by Strike (ASTER_SIGNER / ASTER_SIGNER_KEY, env only, never in the repo);
 *   equity = Σ assets[].marginBalance (wallet + unrealized PnL, all stablecoin collateral). Without the keys the Aster line is pending, never guessed.
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

/**
 * Signed read of the Aster futures account (API v3, "API wallet" auth): the query string (user, signer, nonce in µs) is
 * signed as EIP-712 typed data { domain AsterSignTransaction v1, chainId 1666, zero verifyingContract; Message{msg} } by
 * the read-only API wallet, and sent as ?query&signature=. Keys come only from env (ASTER_SIGNER / ASTER_SIGNER_KEY);
 * without them this returns undefined (Aster shown as pending, never guessed). Equity = Σ assets[].marginBalance.
 */
export async function asterEquity(fetchFn: typeof fetch = fetch, signer = process.env.ASTER_SIGNER, key = process.env.ASTER_SIGNER_KEY,
  user = process.env.ASTER_USER ?? HEDGE_BOT, nowUs = Date.now() * 1000): Promise<number | undefined> {
  if (!signer || !key) return undefined;
  // Tolerate the two values being entered the other way round: an address is 42 chars, a private key 64 (+0x).
  if (signer.replace(/^0x/, '').length === 64 && key.replace(/^0x/, '').length === 40) [signer, key] = [key, signer];
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`);
  const query = new URLSearchParams({ user, signer, nonce: String(nowUs) }).toString();
  const signature = await account.signTypedData({
    domain: { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: '0x0000000000000000000000000000000000000000' },
    types: { Message: [{ name: 'msg', type: 'string' }] }, primaryType: 'Message', message: { msg: query },
  });
  const res = await fetchFn(`${ASTER_API}/fapi/v3/account?${query}&signature=${signature}`);
  if (!res.ok) throw new Error(`Aster ${res.status} ${(await res.text()).slice(0, 160)}`);
  // totalMarginBalance covers USDT only (live: USDT −8,164.77 unrealized while 41,045 USDC sits as collateral), so equity
  // is the sum of every asset's marginBalance (wallet + unrealized PnL); all collateral assets here are USD stablecoins.
  const body = await res.json() as { assets?: { asset: string; marginBalance: string }[]; totalMarginBalance?: string };
  if (!body.assets) return Number(body.totalMarginBalance ?? 0);
  return body.assets.reduce((t, x) => t + Number(x.marginBalance), 0);
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
