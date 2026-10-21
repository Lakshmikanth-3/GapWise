import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { readFile, rm } from 'node:fs/promises';
import solTokens from '../fixtures/solana-token-accounts.json';
import { ethReserves } from '../../packages/collectors/ethereum';
import { solanaReserves, treasuryPda } from '../../packages/collectors/solana';
import { snapshotReserves } from '../../packages/collectors/reserves';
import { pegAdapter, createPricer } from '../../packages/collectors/prices';
import { jsonlStore, toReserveRows } from '../../packages/db/queries';
import { LOCKERS } from '../../packages/core/config';

const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');

describe('T1.4 collectors parse recorded RPC responses', () => {
  it('ethereum: ETH + non-zero whitelisted-candidate tokens', async () => {
    server.use(http.post(ETH_RPC, async ({ request }) => {
      const reqs = await request.json() as { id: number; method: string; params: [{ to: string; data: string }] }[] | { id: number; method: string; params: [{ to: string; data: string }] };
      const answer = (r: { id: number; method: string; params: [{ to: string; data: string }] }) => {
        if (r.method === 'eth_getBalance') return { jsonrpc: '2.0', id: r.id, result: '0x0' };
        const { to, data } = r.params[0];
        const isDecimals = data.startsWith('0x313ce567');
        const result = to.toLowerCase() === USDC ? (isDecimals ? word(6n) : word(203089273214n)) : (isDecimals ? word(18n) : word(0n));
        return { jsonrpc: '2.0', id: r.id, result };
      };
      return HttpResponse.json(Array.isArray(reqs) ? reqs.map(answer) : answer(reqs));
    }));
    const rows = await ethReserves();
    expect(rows).toEqual([
      expect.objectContaining({ asset: 'ETH', amount: 0, holder: LOCKERS.ethereum }),
      expect.objectContaining({ asset: 'USDC', amount: 203089.273214, raw: '203089273214', decimals: 6 }),
    ]);
  });

  it('solana: SOL + SPL tokens of the locker and the treasury PDA', async () => {
    const treasury = treasuryPda().toBase58();
    server.use(http.post(SOL_RPC, async ({ request }) => {
      const r = await request.json() as { id: string; method: string; params: [string] };
      if (r.method === 'getBalance') return HttpResponse.json({ jsonrpc: '2.0', id: r.id, result: { context: { slot: 1 }, value: r.params[0] === treasury ? 946560 : 83604770 } });
      if (r.params[0] === LOCKERS.solana) return HttpResponse.json({ ...solTokens, id: r.id });
      return HttpResponse.json({ jsonrpc: '2.0', id: r.id, result: { context: { slot: 1 }, value: [] } });
    }));
    const rows = await solanaReserves();
    expect(rows.find(r => r.asset === 'USDC')).toMatchObject({ amount: Number(solTokens.result.value[0].account.data.parsed.info.tokenAmount.uiAmountString), contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
    expect(rows.filter(r => r.asset === 'SOL').map(r => r.holder)).toEqual([LOCKERS.solana, treasury]);
  });
});

describe('reserve snapshot + storage', () => {
  it('a failing chain is reported, not zeroed silently (FR reliability)', async () => {
    const s = await snapshotReserves(createPricer([pegAdapter]), {
      ethereum: async () => [{ chain: 'ethereum', asset: 'USDC', amount: 5, contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }],
      cardano: async () => { throw new Error('Koios 503'); },
      solana: async () => [],
    });
    expect(s.failedChains).toEqual(['cardano']);
    expect(s.pricedUsd).toBe(5);
  });

  it('rows land in reserve_snapshots with source and status', async () => {
    const dir = 'tests/.tmp-store';
    await rm(dir, { recursive: true, force: true });
    const s = await snapshotReserves(createPricer([pegAdapter]), {
      ethereum: async () => [{ chain: 'ethereum', asset: 'USDC', amount: 5, contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }],
      cardano: async () => [{ chain: 'cardano', asset: 'ADA', amount: 1 }],
      solana: async () => [],
    });
    await jsonlStore(dir).insert('reserve_snapshots', toReserveRows(s.ts, s.rows));
    const lines = (await readFile(`${dir}/reserve_snapshots.jsonl`, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toEqual([
      expect.objectContaining({ asset: 'USDC', usd_value: 5, price_status: 'priced', price_source: expect.stringMatching(/^peg/) }),
      expect.objectContaining({ asset: 'ADA', usd_value: null, price_status: 'unpriced' }),
    ]);
    await rm(dir, { recursive: true, force: true });
  });
});
