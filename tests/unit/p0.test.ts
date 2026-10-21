import { describe, it, expect } from 'vitest';
import { need } from '../../packages/core/config';
import { valueReserves } from '../../packages/core/valuation';
import { ratioStatus, reserveRatio } from '../../packages/core/ratio';
import { toReserves } from '../../packages/collectors/cardano';
import { isVaultAccount } from '../../packages/collectors/accounts';

const USDM = 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad';
const SUSDR = '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae';
const IUSD = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

describe('P0', () => {
  it('T0.1 CI runs on push', () => expect(true).toBe(true));

  it('T0.2 env check: clear error when a key is missing', () => {
    expect(() => need('TELEGRAM_BOT_TOKEN', {})).toThrow(/Missing env var TELEGRAM_BOT_TOKEN.*\.env\.example/);
    expect(need('X', { X: 'v' })).toBe('v');
  });
});

describe('T1.8 pricing never assumes $1 by name; non-pegged tokens are unpriced', () => {
  const prices = new Map([['ADA', { usd: 0.25, stale: false }], ['ETH', { usd: 2500, stale: true }]]);
  const v = valueReserves([
    { chain: 'ethereum', asset: 'USDC', amount: 10, contract: USDC_ETH },
    { chain: 'cardano', asset: 'USDM', amount: 99, contract: 'deadbeef' + '5553444d' }, // spoofed name
    { chain: 'cardano', asset: 'USDM', amount: 7, contract: USDM + '0014df105553444d' },
    { chain: 'cardano', asset: 'sUSDr', amount: 50, contract: SUSDR + '7355534472' },
    { chain: 'cardano', asset: 'iUSD', amount: 3, contract: IUSD + '69555344' },
    { chain: 'cardano', asset: 'LP-ADA-USDM', amount: 1000, contract: 'abcd' },
    { chain: 'cardano', asset: 'ADA', amount: 4 },
    { chain: 'ethereum', asset: 'WETH', amount: 1, contract: WETH },
    { chain: 'ethereum', asset: 'ETH', amount: 2, contract: '0xfake' }, // a token named ETH is not ETH
  ], prices);

  it('only peg-listed contracts get 1.00, labelled as peg', () => {
    expect(v.rows[0]).toMatchObject({ usdValue: 10, priceSource: 'peg' });
    expect(v.rows[2]).toMatchObject({ usdValue: 7, priceSource: 'peg' });
  });
  it('sUSDr, iUSD, LP and spoofed tokens are listed as unpriced', () => {
    expect(v.unpriced.map(u => u.asset)).toEqual(['USDM', 'sUSDr', 'iUSD', 'LP-ADA-USDM', 'ETH']);
  });
  it('natives priced from the Strike feed, stale flag carried', () => {
    expect(v.pricedUsd).toBe(10 + 7 + 1 + 2500);
    expect(v.stalePrices).toBe(true);
  });
});

describe('T1.7 both Cardano scripts counted (per-holder rows)', () => {
  it('builds rows per script with policy-id tickers; protocol token skipped', () => {
    const a = toReserves('addrA', 1_500_000n, [
      { policy: USDM, nameHex: '0014df105553444d', quantity: 2_000_000n, decimals: 6 },
      { policy: '43dfa7d041840e1280102ab87ccb17051bb4e5c14bf27bda2608e9fc', nameHex: '00', quantity: 1n, decimals: 0 },
    ]);
    const b = toReserves('addrB', 2_000_000n, [{ policy: USDM, nameHex: '0014df105553444d', quantity: 140_000_000n, decimals: 6 }]);
    expect(a).toHaveLength(2);
    expect(a[1]).toMatchObject({ asset: 'USDM', amount: 2, holder: 'addrA' });
    expect([...a, ...b].filter(r => r.asset === 'USDM').reduce((s, r) => s + r.amount, 0)).toBe(142);
  });
});

describe('T2.10 vault accounts excluded', () => {
  it('detects vaults by vault_id or vault_ prefix', () => {
    expect(isVaultAccount({ account_id: 'vault_2e782d92', vault_id: '2e782d92-86f0-48f2-9171-eb0c4633656e' })).toBe(true);
    expect(isVaultAccount({ account_id: 'vault_abc' })).toBe(true);
    expect(isVaultAccount({ account_id: '019d0c4c-4c13-75ea-9497-0e0c8390f4d9', vault_id: '' })).toBe(false);
  });
});

describe('T2.11 ratio status bands (target exactly 100%)', () => {
  it.each([
    [1, 'Balanced'], [1.0001, 'Balanced'], [0.9999, 'Balanced'],
    [1.00011, 'Drift'], [0.995, 'Drift'], [1.01, 'Drift'],
    [1.0101, 'Needs review'], [0.85, 'Needs review'], [1.7, 'Needs review'],
  ])('%f → %s', (r, s) => expect(ratioStatus(r)).toBe(s));
  it('undefined ratio has no status', () => expect(ratioStatus(reserveRatio(1, 0))).toBeUndefined());
});
