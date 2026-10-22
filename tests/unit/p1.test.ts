import { describe, it, expect } from 'vitest';
import { toBaseUnits, fromBaseUnits, DECIMALS } from '../../packages/core/units';
import { usdValue, assessRatio } from '../../packages/core/ratio';
import { liabilityBreakdown } from '../../packages/core/liabilities';
import { strikeCreditAdapter } from '../../packages/collectors/prices';
import { rewardsOf, type BalanceRow } from '../../packages/collectors/accounts';
import { createPricer, pegAdapter, pendingAdapter, type PriceAdapter } from '../../packages/collectors/prices';
import { valueReserves } from '../../packages/core/valuation';

describe('T1.1 unit conversion (exact, BigInt)', () => {
  it('1 ADA / ETH / SOL in base units', () => {
    expect(toBaseUnits('1', DECIMALS.ADA)).toBe(1_000_000n);
    expect(toBaseUnits('1', DECIMALS.ETH)).toBe(10n ** 18n);
    expect(toBaseUnits('1', DECIMALS.SOL)).toBe(1_000_000_000n);
  });
  it('round-trips without float error', () => {
    expect(fromBaseUnits(315201715836n, 6)).toBe('315201.715836');
    expect(fromBaseUnits(123456789012345678901n, 18)).toBe('123.456789012345678901');
    expect(toBaseUnits('0.000000001', 9)).toBe(1n);
    expect(fromBaseUnits(toBaseUnits('-2.5', 6), 6)).toBe('-2.5');
  });
  it('rejects too many decimals instead of rounding', () => expect(() => toBaseUnits('1.0000001', 6)).toThrow());
});

describe('T1.2 USD valuation', () => {
  it('amount × price to 2 decimals', () => expect(usdValue(319205.319156, 0.22726106)).toBe(72542.94));
  it('pegged stablecoin = 1.00', async () => {
    const q = await createPricer([pegAdapter])({ chain: 'ethereum', asset: 'USDC', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' });
    expect(q).toMatchObject({ usd: 1, status: 'priced' });
  });
});

describe('Strike credit adapter (official sUSDrf / LP / aUSDC prices)', () => {
  const body = { assets: {
    sUSDrf: { price: '1.005689', price_available: true, price_fresh: true, price_observed_at: 1 },
    LP_SUNDAE_USDCx_USDM: { price: '1.0164', price_available: true, price_fresh: true, price_observed_at: 1 },
    SCALED_AAVE_V3_ETH_aUSDC: { price: '1.19', price_available: false, price_fresh: false, price_observed_at: 1 },
  } };
  const fake = (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  it('prices custody assets by contract/policy via the Credit mapping; unavailable prices stay unpriced', async () => {
    const p = createPricer([strikeCreditAdapter('https://x', fake)]);
    expect(await p({ chain: 'cardano', asset: 'x', contract: '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae7355534472' })).toMatchObject({ usd: 1.005689, status: 'priced' });
    expect(await p({ chain: 'cardano', asset: 'x', contract: '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d560014df10aa' })).toMatchObject({ usd: 1.0164 });
    expect((await p({ chain: 'ethereum', asset: 'a', contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c' })).status).toBe('unpriced');
    expect((await p({ chain: 'cardano', asset: 'USDM', contract: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad' })).source).toMatch(/^unknown/);
  });
});

describe('pluggable pricer: adding one adapter prices a pending asset', () => {
  const sUSDr = { chain: 'cardano', asset: 'iUSD', contract: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344', amount: 100 };
  it('pending → unpriced today', async () => {
    const v = await valueReserves([sUSDr], createPricer([pegAdapter, pendingAdapter]));
    expect(v.unpriced).toHaveLength(1);
    expect(v.rows[0].quote).toMatchObject({ status: 'unpriced', source: expect.stringMatching(/^pending/) });
  });
  it('an official adapter placed before pending takes over', async () => {
    const official: PriceAdapter = { name: 'strike-official', matches: a => a.asset === 'iUSD', getPrice: async () => ({ usd: 1.04, source: 'strike-official', ts: 1, status: 'priced' }) };
    const v = await valueReserves([sUSDr], createPricer([official, pegAdapter, pendingAdapter]));
    expect(v).toMatchObject({ pricedUsd: 104, unpriced: [] });
  });
});

describe('liabilities = withdrawable value: margin_balance minus locked rewards; other rewards excluded', () => {
  it('discounts rewards (founder rule) and keeps excluded lines visible', () => {
    const b = liabilityBreakdown({ totalUsd: 1000, stakingRewardsUsd: 50, lockedRewardsUsd: 30 });
    expect(b.exposedUsd).toBe(970);
    expect(b.pendingEstimateUsd).toBe(0);
    expect(b.components.map(c => [c.name.split(' ')[0], c.status])).toEqual([['margin_balance', 'counted'], ['Locked', 'deducted'], ['Staking', 'excluded'], ['Referral', 'excluded']]);
  });

  const row = (o: Partial<BalanceRow>): BalanceRow => ({ asset: 'USDT', walletBalance: '100', maxWithdrawAmount: '100', maxWithdrawAfterRewards: '100', lockedRewards: '0', stakingRewardBalance: '0', ...o });
  it('reads stakingRewardBalance and tests whether lockedRewards sits inside walletBalance', () => {
    expect(rewardsOf([row({ stakingRewardBalance: '6.2' })])).toEqual({ staking: 6.2, locked: 0, lockedInWallet: undefined });
    expect(rewardsOf([row({ lockedRewards: '10', maxWithdrawAfterRewards: '90' })]).lockedInWallet).toBe(true);
    expect(rewardsOf([row({ lockedRewards: '10' })]).lockedInWallet).toBe(false);
  });
});

describe('assessRatio: pending components are not Drift / Needs review', () => {
  const base = { unpricedReserves: 0, pendingLiabilityEstimateUsd: 25_000 };
  it('Balanced stays Balanced', () => expect(assessRatio({ ...base, reservesUsd: 1_000_050, liabilitiesUsd: 1_000_000 }).status).toBe('Balanced'));
  it('surplus within the pending referral estimate → Incomplete', () => {
    expect(assessRatio({ ...base, reservesUsd: 1_020_000, liabilitiesUsd: 1_000_000 })).toMatchObject({ status: 'Incomplete', explainedBy: expect.stringMatching(/pending liabilities/) });
  });
  it('surplus beyond the estimate is still Needs review', () => {
    expect(assessRatio({ ...base, reservesUsd: 1_100_000, liabilitiesUsd: 1_000_000 }).status).toBe('Needs review');
  });
  it('shortfall with unpriced reserves → Incomplete; without → banded', () => {
    expect(assessRatio({ ...base, unpricedReserves: 2, reservesUsd: 900_000, liabilitiesUsd: 1_000_000 }).status).toBe('Incomplete');
    expect(assessRatio({ ...base, reservesUsd: 995_000, liabilitiesUsd: 1_000_000 }).status).toBe('Drift');
  });
});
