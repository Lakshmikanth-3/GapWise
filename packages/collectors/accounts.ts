import { env } from '../core/config';
import { createRateLimiter, withRetry } from '../core/rateLimiter';

// Live shape (verified 22 Oct 2026): { entries: [{ account_id, vault_id, equity, ... }], total, updated_at }.
// Vault rows have account_id "vault_<8hex>" and the full UUID in vault_id.
type LbEntry = { account_id: string; vault_id?: string };
type Account = { account_id: string; margin_balance: string; wallet_balance: string; unrealized_pnl?: string; sub_accounts?: { account_id: string }[] };

/**
 * What Strike owes an account: its equity = wallet_balance + unrealized_pnl (founder, 23 Oct 10:58). margin_balance is
 * NOT used: it equals available_balance and leaves out isolated-margin positions (docs/DECISIONS.md #50).
 */
export const equityOf = (a: { wallet_balance: string; unrealized_pnl?: string }) => Number(a.wallet_balance) + Number(a.unrealized_pnl ?? 0);
// GET /v2/balances?account_id= → one row per collateral asset (live: a single USDT row).
export type BalanceRow = { asset: string; walletBalance: string; maxWithdrawAmount: string; maxWithdrawAfterRewards: string; lockedRewards: string; stakingRewardBalance: string };

/** Raw per-account values as returned by Strike (strings preserved) — published in verify reports for diffing. */
export type AccountRow = { account_id: string; sub_account: boolean; wallet_balance: string; unrealized_pnl: string; margin_balance: string; lockedRewards: string; stakingRewardBalance: string };
export type VaultRow = { vault_id: string; wallet_balance: string; unrealized_pnl: string; margin_balance: string };
/** One depositor's share of a vault (GET /v2/vault/{id}/depositors current_equity), raw string preserved. */
export type VaultShareRow = { vault_id: string; address: string; current_equity: string };

export type LiabilityScan = {
  accounts: AccountRow[]; vaults: VaultRow[]; vaultShares: VaultShareRow[];
  /** Σ depositors' vault shares — owed to users but NOT inside their own equity (founder, 22 Oct 23:33). */
  vaultSharesUsd: number;
  listed: number; excludedVaults: number;
  /** Σ equity of the excluded vault accounts, read separately for audit; NOT in totalUsd. */
  vaultsUsd: number; discovered: number; read: number; failed: string[];
  /** Σ equity = wallet_balance + unrealized_pnl (non-vault accounts + sub-accounts). */
  totalUsd: number;
  /** Σ margin_balance, for transparency only: totalUsd − this = isolated-margin equity margin_balance leaves out. */
  marginBalanceUsd: number;
  /** Σ stakingRewardBalance — segregated from margin per the docs, so it is an extra liability. */
  stakingRewardsUsd: number;
  /** Σ lockedRewards — logged only; see lockedInWallet for whether it already sits inside walletBalance. */
  lockedRewardsUsd: number;
  /** Accounts with lockedRewards > 0 where maxWithdrawAmount − maxWithdrawAfterRewards == lockedRewards (i.e. inside walletBalance) vs not. */
  lockedInWallet: { consistent: number; inconsistent: number };
  negative: string[]; startedAt: number; ts: number;
};

export class HttpError extends Error { constructor(public status: number, url: string) { super(`${status} ${url}`); } }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json() as Promise<T>;
}

/**
 * Vault accounts are excluded (confirmed by Shan): a depositor's vault share is already inside their own
 * equity, so counting the vault too double-counts it.
 */
export const isVaultAccount = (e: { account_id: string; vault_id?: string }) => !!e.vault_id || e.account_id.startsWith('vault_');

/** No params = full list (per Strike). Leaderboard balances lag, so only ids are used. */
export async function listAccounts(base = env.strikeApi): Promise<{ ids: string[]; excludedVaults: number; vaultIds: string[] }> {
  const lb = await getJson<{ entries: LbEntry[] }>(`${base}/stat/v1/stats/leaderboard`);
  const ids = new Set<string>(); const vaults = new Map<string, string>();
  for (const e of lb.entries) {
    if (!e.account_id) continue;
    if (isVaultAccount(e)) vaults.set(e.account_id, e.vault_id ?? ''); else ids.add(e.account_id);
  }
  return { ids: [...ids], excludedVaults: vaults.size, vaultIds: [...vaults.values()].filter(Boolean) };
}

/** Rewards from one /v2/balances response, plus whether lockedRewards is already inside walletBalance. */
/**
 * Rewards from one /v2/balances response. lockedRewards counts as "inside the wallet" when the withdrawable amount leaves
 * room for it: walletBalance − maxWithdrawAmount ≥ lockedRewards (live evidence: wallet 19.24, locked 4.83, max 14.41).
 */
export function rewardsOf(rows: BalanceRow[]): { staking: number; locked: number; lockedInWallet?: boolean } {
  let staking = 0, locked = 0, notWithdrawable = 0;
  for (const r of rows) {
    staking += Number(r.stakingRewardBalance ?? 0);
    locked += Number(r.lockedRewards ?? 0);
    notWithdrawable += Number(r.walletBalance ?? 0) - Number(r.maxWithdrawAmount ?? 0);
  }
  return { staking, locked, lockedInWallet: locked > 0 ? notWithdrawable >= locked - 1e-6 : undefined };
}

export async function scanLiabilities(base = env.strikeApi, rps = env.rps, opts: { retryBaseMs?: number } = {}): Promise<LiabilityScan> {
  const startedAt = Date.now();
  // One limiter for both endpoints: two calls per account, still ≤ rps in total.
  const take = createRateLimiter(rps);
  const get = <T>(url: string) => withRetry(async () => { await take(); return getJson<T>(url); }, 3, opts.retryBaseMs);
  const { ids, excludedVaults, vaultIds } = await listAccounts(base);
  const queue = [...ids];
  const listed = queue.length;
  const seen = new Set(queue);
  const failed: string[] = []; const negative: string[] = [];
  const lockedInWallet = { consistent: 0, inconsistent: 0 };
  let total = 0, margin = 0, staking = 0, locked = 0, read = 0, discovered = 0;
  const accounts: AccountRow[] = []; const vaults: VaultRow[] = []; const subs = new Set<string>();

  async function one(id: string) {
    const q = `account_id=${encodeURIComponent(id)}`;
    try {
      // Both reads must succeed before anything is counted, so a half-read account is a clean failure.
      const [a, bal] = await Promise.all([get<Account>(`${base}/v2/account?${q}`), get<BalanceRow[]>(`${base}/v2/balances?${q}`)]);
      const v = equityOf(a);
      const r = rewardsOf(bal);
      total += v; margin += Number(a.margin_balance); staking += r.staking; locked += r.locked; read++;
      accounts.push({ account_id: a.account_id || id, sub_account: subs.has(id), wallet_balance: a.wallet_balance, unrealized_pnl: a.unrealized_pnl ?? '0', margin_balance: a.margin_balance, lockedRewards: String(r.locked), stakingRewardBalance: String(r.staking) });
      if (r.lockedInWallet !== undefined) lockedInWallet[r.lockedInWallet ? 'consistent' : 'inconsistent']++;
      if (v < 0) negative.push(id);
      for (const s of a.sub_accounts ?? []) {
        if (seen.has(s.account_id) || s.account_id.startsWith('vault_')) continue;
        seen.add(s.account_id); subs.add(s.account_id); discovered++; queue.push(s.account_id);
      }
    } catch { failed.push(id); }
  }

  let active = 0;
  const workers = Array.from({ length: Math.min(rps, 20) }, async () => {
    // Keep workers alive while others may still push sub-accounts.
    for (;;) {
      const id = queue.shift();
      if (!id) { if (active === 0) return; await new Promise(r => setTimeout(r, 20)); continue; }
      active++; try { await one(id); } finally { active--; }
    }
  });
  await Promise.all(workers);

  // Vault accounts are excluded (no double counting), but each depositor's share of a vault is a liability that is NOT
  // inside that depositor's equity, so it is added from /v2/vault/{id}/depositors. The vault account's own equity is
  // kept as an audit cross-check: Σ depositor shares ≈ vault equity (docs/DECISIONS.md #48).
  let vaultsUsd = 0, vaultSharesUsd = 0;
  const vaultShares: VaultShareRow[] = [];
  for (const vid of vaultIds) {
    try {
      const va = await get<Account>(`${base}/v2/account?vault_id=${encodeURIComponent(vid)}`);
      vaultsUsd += equityOf(va); vaults.push({ vault_id: vid, wallet_balance: va.wallet_balance, unrealized_pnl: va.unrealized_pnl ?? '0', margin_balance: va.margin_balance });
      let cursor: string | undefined;
      do {
        const page = await get<{ depositors: { address: string; current_equity: string }[]; next_cursor?: string | null }>(
          `${base}/v2/vault/${encodeURIComponent(vid)}/depositors?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        for (const d of page.depositors ?? []) { vaultSharesUsd += Number(d.current_equity); vaultShares.push({ vault_id: vid, address: d.address, current_equity: d.current_equity }); }
        cursor = page.next_cursor || undefined;
      } while (cursor);
    } catch { failed.push(`vault:${vid}`); }
  }
  return {
    listed, excludedVaults, vaultsUsd, vaultSharesUsd, vaultShares, discovered, read, failed, totalUsd: total, marginBalanceUsd: margin,
    stakingRewardsUsd: staking, lockedRewardsUsd: locked, lockedInWallet, negative, startedAt, ts: Date.now(), accounts, vaults,
  };
}
