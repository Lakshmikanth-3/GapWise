import { env } from '../core/config';
import { createRateLimiter, withRetry } from '../core/rateLimiter';

// Live shape (verified 22 Oct 2026): { entries: [{ account_id, vault_id, equity, ... }], total, updated_at }.
// Vault rows have account_id "vault_<8hex>" and the full UUID in vault_id.
type LbEntry = { account_id: string; vault_id?: string };
type Account = { account_id: string; margin_balance: string; sub_accounts?: { account_id: string }[] };

export type LiabilityScan = {
  listed: number; excludedVaults: number;
  /** Σ margin_balance of the excluded vault accounts, read separately for audit; NOT in totalUsd. */
  vaultsUsd: number; discovered: number; read: number; failed: string[];
  totalUsd: number; negative: string[]; startedAt: number; ts: number;
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

export async function scanLiabilities(base = env.strikeApi, rps = env.rps, opts: { retryBaseMs?: number } = {}): Promise<LiabilityScan> {
  const startedAt = Date.now();
  const take = createRateLimiter(rps);
  const { ids, excludedVaults, vaultIds } = await listAccounts(base);
  const queue = [...ids];
  const listed = queue.length;
  const seen = new Set(queue);
  const failed: string[] = []; const negative: string[] = [];
  let total = 0, read = 0, discovered = 0;

  async function one(id: string) {
    try {
      const a = await withRetry(async () => { await take(); return getJson<Account>(`${base}/v2/account?account_id=${encodeURIComponent(id)}`); }, 3, opts.retryBaseMs);
      const v = Number(a.margin_balance);
      total += v; read++;
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
    try {
      const a = await withRetry(async () => { await take(); return getJson<Account>(`${base}/v2/account?vault_id=${encodeURIComponent(vid)}`); }, 3, opts.retryBaseMs);
      vaultsUsd += Number(a.margin_balance);
    } catch { failed.push(`vault:${vid}`); }
  }
  return { listed, excludedVaults, vaultsUsd, discovered, read, failed, totalUsd: total, negative, startedAt, ts: Date.now() };
}
