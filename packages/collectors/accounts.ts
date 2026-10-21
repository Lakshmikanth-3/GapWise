import { env } from '../core/config';
import { createRateLimiter, withRetry } from '../core/rateLimiter';

// Live shape (verified 22 Oct 2026): { entries: [{ account_id, vault_id, equity, ... }], total, updated_at }.
// Vault rows have account_id "vault_<8hex>" and the full UUID in vault_id.
type LbEntry = { account_id: string; vault_id?: string };
type Account = { account_id: string; margin_balance: string; sub_accounts?: { account_id: string }[] };

export type AccountRef = { id: string; vaultId?: string };
export type LiabilityScan = { listed: number; discovered: number; read: number; failed: string[]; totalUsd: number; negative: string[]; ts: number };

export class HttpError extends Error { constructor(public status: number, url: string) { super(`${status} ${url}`); } }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json() as Promise<T>;
}

/** No params = full list (per Strike). Leaderboard balances lag, so only ids are used. */
export async function listAccounts(base = env.strikeApi): Promise<AccountRef[]> {
  const lb = await getJson<{ entries: LbEntry[] }>(`${base}/stat/v1/stats/leaderboard`);
  const byId = new Map<string, AccountRef>();
  for (const e of lb.entries) if (e.account_id && !byId.has(e.account_id)) byId.set(e.account_id, { id: e.account_id, vaultId: e.vault_id || undefined });
  return [...byId.values()];
}

export function accountUrl(base: string, ref: AccountRef): string {
  return ref.vaultId
    ? `${base}/v2/account?vault_id=${encodeURIComponent(ref.vaultId)}`
    : `${base}/v2/account?account_id=${encodeURIComponent(ref.id)}`;
}

export async function scanLiabilities(base = env.strikeApi, rps = env.rps, opts: { retryBaseMs?: number } = {}): Promise<LiabilityScan> {
  const take = createRateLimiter(rps);
  const queue = await listAccounts(base);
  const listed = queue.length;
  const seen = new Set(queue.map(r => r.id));
  const failed: string[] = []; const negative: string[] = [];
  let total = 0, read = 0, discovered = 0;

  async function one(ref: AccountRef) {
    try {
      const a = await withRetry(async () => { await take(); return getJson<Account>(accountUrl(base, ref)); }, 3, opts.retryBaseMs);
      // Count by the resolved id so a vault/sub-account seen twice is summed once.
      if (a.account_id && a.account_id !== ref.id && seen.has(a.account_id)) { read++; return; }
      seen.add(a.account_id);
      const v = Number(a.margin_balance);
      total += v; read++;
      if (v < 0) negative.push(ref.id);
      for (const s of a.sub_accounts ?? []) if (!seen.has(s.account_id)) { seen.add(s.account_id); discovered++; queue.push({ id: s.account_id }); }
    } catch { failed.push(ref.id); }
  }

  let active = 0;
  const workers = Array.from({ length: Math.min(rps, 20) }, async () => {
    // Keep workers alive while others may still push sub-accounts.
    for (;;) {
      const ref = queue.shift();
      if (!ref) { if (active === 0) return; await new Promise(r => setTimeout(r, 20)); continue; }
      active++; try { await one(ref); } finally { active--; }
    }
  });
  await Promise.all(workers);
  return { listed, discovered, read, failed, totalUsd: total, negative, ts: Date.now() };
}
