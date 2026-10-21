import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import leaderboard from '../fixtures/leaderboard.json';
import account from '../fixtures/account.json';
import premium from '../fixtures/premiumIndex.json';
import { listAccounts, scanLiabilities } from '../../packages/collectors/accounts';
import { createPriceFeed } from '../../packages/collectors/prices';

const B = 'https://strike.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('accounts collector (mocked fixtures)', () => {
  it('lists leaderboard ids, keeping full vault UUIDs', async () => {
    server.use(http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json(leaderboard)));
    const refs = await listAccounts(B);
    expect(refs).toHaveLength(4);
    expect(refs[3].vaultId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sums margin_balance, queries vaults by vault_id, discovers sub-accounts once', async () => {
    const first = leaderboard.entries[0].account_id;
    server.use(
      http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json(leaderboard)),
      http.get(`${B}/v2/account`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        const id = q.get('account_id') ?? `vault_${q.get('vault_id')!.slice(0, 8)}`;
        // first account owns a sub-account, which is also listed again by another master
        const subs = id === first || id === leaderboard.entries[1].account_id ? [{ account_id: 'sub-1' }] : [];
        return HttpResponse.json({ ...account, account_id: id, margin_balance: id === 'sub-1' ? '-2' : '10', sub_accounts: subs });
      }),
    );
    const s = await scanLiabilities(B, 40);
    expect(s).toMatchObject({ listed: 4, discovered: 1, read: 5, failed: [], totalUsd: 38, negative: ['sub-1'] });
  });

  it('records an account as failed after 3 errors', async () => {
    server.use(
      http.get(`${B}/stat/v1/stats/leaderboard`, () => HttpResponse.json({ entries: [{ account_id: 'a' }] })),
      http.get(`${B}/v2/account`, () => new HttpResponse(null, { status: 503 })),
    );
    const s = await scanLiabilities(B, 40, { retryBaseMs: 1 });
    expect(s.failed).toEqual(['a']);
    expect(s.read).toBe(0);
  });
});

describe('price feed (mocked fixture)', () => {
  it('parses premiumIndex and falls back to last good price with stale flag', async () => {
    let fail = false;
    server.use(http.get(`${B}/price/v2/premiumIndex`, () => (fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(premium))));
    const feed = createPriceFeed(B);
    const p1 = await feed();
    expect(p1.get('ADA')).toMatchObject({ stale: false });
    expect(p1.get('ADA')!.usd).toBeGreaterThan(0);
    fail = true;
    const p2 = await feed();
    expect(p2.get('ADA')).toMatchObject({ usd: p1.get('ADA')!.usd, stale: true });
  });
});
