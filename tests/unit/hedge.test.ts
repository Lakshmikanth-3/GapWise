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

import { flowChainOf, SOLANA_RELAYER } from '../../packages/collectors/flows';
describe('flow match: Solana deposits relayed into the Ethereum locker (founder, 23 Oct)', () => {
  it('a Deposit sent by the Solana relayer counts as a Solana inflow; everything else stays Ethereum', () => {
    expect(flowChainOf('Deposit', '0x8F0Eb9CaCd6f35E2aFb64F137fD1ba797FA1ECa7')).toBe('solana');
    expect(SOLANA_RELAYER).toBe('0x8f0eb9cacd6f35e2afb64f137fd1ba797fa1eca7');
    expect(flowChainOf('Deposit', '0x1111111111111111111111111111111111111111')).toBe('ethereum');
    expect(flowChainOf('Withdraw', SOLANA_RELAYER)).toBe('ethereum');
  });
});

import { foldRelayedDeposits } from '../../packages/collectors/stats';
it('reported deposits of relayed chains fold into the Solana row (22 Oct: 2,447.27 = relayer 2,418.45 + Solana locker 28.82)', () => {
  const d = '2026-10-22';
  const rows = foldRelayedDeposits([
    { day: d, chain: 'solana', in: 1028.56, out: 764.4 }, { day: d, chain: 'base', in: 937.26, out: 0 },
    { day: d, chain: 'bsc', in: 103.83, out: 0 }, { day: d, chain: 'polygon', in: 377.62, out: 0 },
    { day: d, chain: 'tron', in: 0, out: 524 }, { day: d, chain: 'ethereum', in: 19972.94, out: 100009.01 },
  ]);
  expect(rows.find(r => r.chain === 'solana')).toEqual({ day: d, chain: 'solana', in: 2447.27, out: 764.4 });
  expect(rows.find(r => r.chain === 'tron')!.out).toBe(524);
  expect(rows.find(r => r.chain === 'ethereum')!.in).toBe(19972.94);
});
