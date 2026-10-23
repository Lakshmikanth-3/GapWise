import { describe, it, expect } from 'vitest';
import { hedgeReserves, HEDGE_BOT, LIGHTER_EQUITY } from '../../packages/collectors/hedge';

describe("Strike hedging bot equity on Lighter (founder, 23 Oct)", () => {
  it('sums total_asset_value of every Lighter account of the bot address as one USD reserve row', async () => {
    let url = '';
    const fake = (async (u: string) => { url = u; return new Response(JSON.stringify({ accounts: [{ index: 1, collateral: '32732.13', total_asset_value: '26574.94' }, { index: 2, collateral: '1', total_asset_value: '1' }] })); }) as typeof fetch;
    const rows = await hedgeReserves(fake);
    expect(url).toContain(HEDGE_BOT);
    expect(rows).toEqual([{ chain: 'hedge', asset: 'USD equity (Lighter)', amount: 26575.94, contract: LIGHTER_EQUITY, holder: HEDGE_BOT }]);
  });
  it('fails loudly (never zero) when Lighter is down', async () => {
    await expect(hedgeReserves((async () => new Response('', { status: 503 })) as typeof fetch)).rejects.toThrow('Lighter 503');
  });
});
