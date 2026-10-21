import { env } from '../core/config';
import { createRateLimiter, withRetry } from '../core/rateLimiter';

// Live shape (verified 22 Oct 2026): { entries: [{ account_id, vault_id, equity, ... }], total, updated_at }.
// Vault rows have account_id "vault_<8hex>" and the full UUID in vault_id.
type LbEntry = { account_id: string; vault_id?: string };
type Account = { account_id: string; margin_balance: string; sub_accounts?: { account_id: string }[] };
// GET /v2/balances?account_id= → one row per collateral asset (live: a single USDT row).
export type BalanceRow = { asset: string; walletBalance: string; maxWithdrawAmount: string; maxWithdrawAfterRewards: string; lockedRewards: string; stakingRewardBalance: string };

export type LiabilityScan = {
  listed: number; excludedVaults: number;
  /** Σ margin_balance of the excluded vault accounts, read separately for audit; NOT in totalUsd. */
  vaultsUsd: number; discovered: number; read: number; failed: string[];
  /** Σ margin_balance (non-vault accounts + sub-accounts). */
  totalUsd: number;
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
 * margin_balance, so counting the vault too double-counts it.
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
export function rewardsOf(rows: BalanceRow[]): { staking: number; locked: number; lockedInWallet?: boolean } {
  let staking = 0, locked = 0, withdrawGap = 0;
  for (const r of rows) {
    staking += Number(r.stakingRewardBalance ?? 0);
    locked += Number(r.lockedRewards ?? 0);
    withdrawGap += Number(r.maxWithdrawAmount ?? 0) - Number(r.maxWithdrawAfterRewards ?? 0);
  }
  return { staking, locked, lockedInWallet: locked > 0 ? Math.abs(withdrawGap - locked) < 1e-6 : undefined };
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
  let total = 0, staking = 0, locked = 0, read = 0, discovered = 0;

  async function one(id: string) {
    const q = `account_id=${encodeURIComponent(id)}`;
    try {
      // Both reads must succeed before anything is counted, so a half-read account is a clean failure.
      const [a, bal] = await Promise.all([get<Account>(`${base}/v2/account?${q}`), get<BalanceRow[]>(`${base}/v2/balances?${q}`)]);
      const v = Number(a.margin_balance);
      const r = rewardsOf(bal);
      total += v; staking += r.staking; locked += r.locked; read++;
      if (r.lockedInWallet !== undefined) lockedInWallet[r.lockedInWallet ? 'consistent' : 'inconsistent']++;
      if (v < 0) negative.push(id);
      for (const s of a.sub_accounts ?? []) {
        if (seen.has(s.account_id) || s.account_id.startsWith('vault_')) continue;
        seen.add(s.account_id); discovered++; queue.push(s.account_id);
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

  // Audit only: vault value is excluded from liabilities per the founder, but recorded so the
  // exclusion can be checked against the data (see docs/DECISIONS.md #11).
  let vaultsUsd = 0;
  for (const vid of vaultIds) {
    try { vaultsUsd += Number((await get<Account>(`${base}/v2/account?vault_id=${encodeURIComponent(vid)}`)).margin_balance); }
    catch { failed.push(`vault:${vid}`); }
  }
  return {
    listed, excludedVaults, vaultsUsd, discovered, read, failed, totalUsd: total,
    stakingRewardsUsd: staking, lockedRewardsUsd: locked, lockedInWallet, negative, startedAt, ts: Date.now(),
  };
}
