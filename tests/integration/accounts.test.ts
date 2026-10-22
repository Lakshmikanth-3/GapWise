import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import leaderboard from '../fixtures/leaderboard.json';
import account from '../fixtures/account.json';
import premium from '../fixtures/premiumIndex.json';
import koios from '../fixtures/koios-address-info.json';
import { listAccounts, scanLiabilities } from '../../packages/collectors/accounts';
import { strikeFeedAdapter } from '../../packages/collectors/prices';
import balances from '../fixtures/balances.json';
import { cardanoReserves } from '../../packages/collectors/cardano';
import { LOCKERS } from '../../packages/core/config';

const B = 'https://strike.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('accounts collector (mocked fixtures)', () => {
  it('T2.10 lists leaderboard ids and excludes vault accounts', async () => {
    server.use(http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json(leaderboard)));
    const { ids, excludedVaults } = await listAccounts(B);
    expect(ids).toHaveLength(3);
    expect(ids.some(i => i.startsWith('vault_'))).toBe(false);
    expect(excludedVaults).toBe(1);
  });

  it('T2.3 sums margin_balance, discovers a sub-account once; T2.4 negative equity included as-is and flagged; scan is timestamped', async () => {
    const [a0, a1] = leaderboard.entries.map(e => e.account_id);
    const requested: string[] = [];
    server.use(
      http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json(leaderboard)),
      http.get(`${B}/v2/balances`, ({ request }) => {
        const id = new URL(request.url).searchParams.get('account_id');
        return HttpResponse.json([{ ...balances[0], stakingRewardBalance: id === a0 ? '1.5' : '0', lockedRewards: id === a1 ? '4' : '0', maxWithdrawAmount: id === a1 ? String(Number(balances[0].walletBalance) - 4) : balances[0].maxWithdrawAmount }]);
      }),
      http.get(`${B}/v2/account`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        const id = q.get('account_id') ?? `vault-audit:${q.get('vault_id')}`;
        requested.push(id);
        // both masters report the same sub-account, plus a vault-shaped id that must be ignored
        const subs = id === a0 || id === a1 ? [{ account_id: 'sub-1' }, { account_id: 'vault_x' }] : [];
        return HttpResponse.json({ ...account, account_id: id, margin_balance: id === 'sub-1' ? '-2' : '10', sub_accounts: subs });
      }),
    );
    const s = await scanLiabilities(B, 40);
    expect(s).toMatchObject({ listed: 3, excludedVaults: 1, vaultsUsd: 10, discovered: 1, read: 4, failed: [], totalUsd: 28, stakingRewardsUsd: 1.5, lockedRewardsUsd: 4, lockedInWallet: { consistent: 1, inconsistent: 0 }, negative: ['sub-1'] });
    expect(requested.filter(r => r === 'sub-1')).toHaveLength(1);
    expect(requested.some(r => r.startsWith('vault_'))).toBe(false);
    expect(s.startedAt).toBeLessThanOrEqual(s.ts);
  });

  it('T2.6 records an account as failed after 3 errors', async () => {
    server.use(
      http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json({ entries: [{ account_id: 'a' }] })),
      http.get(`${B}/v2/account`, () => new HttpResponse(null, { status: 503 })),
    );
    const s = await scanLiabilities(B, 40, { retryBaseMs: 1 });
    expect(s.failed).toEqual(['a']);
    expect(s.read).toBe(0);
  });
});

describe('T1.3 price feed fallback (mocked fixture)', () => {
  it('parses premiumIndex; on error returns last good price with stale status', async () => {
    let fail = false;
    server.use(http.get(`${B}/price/v2/premiumIndex`, () => (fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(premium))));
    const feed = strikeFeedAdapter(B, fetch, 0);
    const ada = { chain: 'cardano', asset: 'ADA' };
    const p1 = await feed.getPrice(ada);
    expect(p1).toMatchObject({ status: 'priced' });
    expect(p1.usd).toBeGreaterThan(0);
    fail = true;
    expect(await feed.getPrice(ada)).toMatchObject({ usd: p1.usd, status: 'stale' });
  });
});

describe('T1.7 Cardano collector reads both scripts (recorded Koios fixture)', () => {
  it('returns rows for each script address', async () => {
    let body: { _addresses: string[] } | undefined;
    server.use(http.post('https://api.koios.rest/api/v1/address_info', async ({ request }) => { body = await request.json() as typeof body; return HttpResponse.json(koios); }));
    const rows = await cardanoReserves();
    expect(body!._addresses).toEqual([...LOCKERS.cardano]);
    expect(new Set(rows.map(r => r.holder))).toEqual(new Set(LOCKERS.cardano));
    expect(rows.some(r => r.asset === 'STRIKE_V21_PROTOCOL')).toBe(false);
  });

  it('fails loudly if one script is missing from the response', async () => {
    server.use(http.post('https://api.koios.rest/api/v1/address_info', () => HttpResponse.json(koios.slice(0, 1))));
    await expect(cardanoReserves()).rejects.toThrow(/1\/2/);
  });
});
