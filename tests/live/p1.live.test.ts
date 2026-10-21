import { describe, it, expect } from 'vitest';
import { ethReserves } from '../../packages/collectors/ethereum';
import { cardanoReserves } from '../../packages/collectors/cardano';
import { solanaReserves } from '../../packages/collectors/solana';
import { createPricer } from '../../packages/collectors/prices';

const nonZero = (rows: { amount: number }[]) => rows.some(r => r.amount > 0);

describe('T1.5 live smoke: each collector returns non-zero balances within 10 s', () => {
  it('ethereum', async () => expect(nonZero(await ethReserves())).toBe(true), 10_000);
  it('cardano (both scripts)', async () => {
    const rows = await cardanoReserves();
    expect(new Set(rows.map(r => r.holder)).size).toBe(2);
    expect(nonZero(rows)).toBe(true);
  }, 10_000);
  it('solana', async () => expect(nonZero(await solanaReserves())).toBe(true), 10_000);
  it('strike price feed prices ADA/ETH/SOL', async () => {
    const p = createPricer();
    for (const asset of ['ADA', 'ETH', 'SOL']) expect((await p({ chain: 'x', asset })).status).toBe('priced');
  }, 10_000);
});
