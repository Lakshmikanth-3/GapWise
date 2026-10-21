import { describe, it, expect } from 'vitest';
import { need } from '../../packages/core/config';
import { valueReserves } from '../../packages/core/valuation';
import { toReserves } from '../../packages/collectors/cardano';

describe('P0', () => {
  it('T0.1 CI runs on push', () => expect(true).toBe(true));

  it('T0.2 env check: clear error when a key is missing', () => {
    expect(() => need('TELEGRAM_BOT_TOKEN', {})).toThrow(/Missing env var TELEGRAM_BOT_TOKEN.*\.env\.example/);
    expect(need('X', { X: 'v' })).toBe('v');
  });
});

describe('reserve valuation guards', () => {
  const prices = new Map([['ADA', { usd: 0.25, stale: false }], ['ETH', { usd: 2500, stale: true }]]);

  it('stablecoins only by flag, unknown assets flagged unpriced', () => {
    const v = valueReserves([
      { chain: 'ethereum', asset: 'USDC', amount: 10, stable: true },
      { chain: 'cardano', asset: 'USDM', amount: 99 }, // name alone must not count as $1
      { chain: 'cardano', asset: 'ADA', amount: 4 },
      { chain: 'ethereum', asset: 'WETH', amount: 1 },
    ], prices);
    expect(v.totalUsd).toBe(10 + 1 + 2500);
    expect(v.unpriced).toEqual(['cardano:USDM']);
    expect(v.stalePrices).toBe(true);
  });

  it('cardano: stables matched by policy id, protocol token skipped, decimals applied', () => {
    const r = toReserves(1_500_000n, [
      { policy: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad', nameHex: '0014df105553444d', quantity: 2_000_000n, decimals: 6 },
      { policy: '43dfa7d041840e1280102ab87ccb17051bb4e5c14bf27bda2608e9fc', nameHex: '00', quantity: 1n, decimals: 0 },
      { policy: 'deadbeef', nameHex: Buffer.from('USDM').toString('hex'), quantity: 5n, decimals: 0 },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ asset: 'ADA', amount: 1.5 });
    expect(r[1]).toMatchObject({ asset: 'USDM', amount: 2, stable: true });
    expect(r[2]).toMatchObject({ asset: 'USDM', stable: false }); // spoofed name
  });
});
