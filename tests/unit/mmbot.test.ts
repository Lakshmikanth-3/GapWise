import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { asterEquity, hedgeReserves, HEDGE_BOT, ASTER_EQUITY } from '../../packages/collectors/hedge';

describe("Strike market-maker bot on external exchanges (founder, 23 Oct 18:43)", () => {
  it('Aster: signed read-only call (HMAC-SHA256 of the query, key in header); equity = totalMarginBalance', async () => {
    let url = '', hdr = '';
    const f = (async (u: string, init?: RequestInit) => { url = u; hdr = (init?.headers as Record<string, string>)['X-MBX-APIKEY']; return new Response(JSON.stringify({ totalMarginBalance: '41234.5' })); }) as typeof fetch;
    expect(await asterEquity(f, 'k', 's', 1000)).toBe(41234.5);
    const q = 'timestamp=1000&recvWindow=10000';
    expect(url).toBe(`https://fapi.asterdex.com/fapi/v2/account?${q}&signature=${createHmac('sha256', 's').update(q).digest('hex')}`);
    expect(hdr).toBe('k');
  });
  it('Aster without keys is pending (undefined), never a guessed zero', async () => {
    expect(await asterEquity(fetch, undefined, undefined)).toBeUndefined();
  });
  it('rows are labelled hedge and held by the bot address', async () => {
    const f = (async () => new Response(JSON.stringify({ accounts: [{ index: 1, collateral: '1', total_asset_value: '100' }] }))) as typeof fetch;
    const rows = await hedgeReserves(f);
    expect(rows[0]).toMatchObject({ chain: 'hedge', holder: HEDGE_BOT, amount: 100 });
    expect(rows.some((r) => r.contract === ASTER_EQUITY)).toBe(!!process.env.ASTER_API_KEY);
  });
});
