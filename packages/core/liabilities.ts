/**
 * Liabilities = margin_balance + rewards owed that are NOT inside margin_balance (founder, 22 Oct).
 * Components that Strike does not expose yet are carried as `pending` lines so the gap is visible, never hidden.
 */
export type LiabilityComponent = {
  name: string;
  status: 'exposed' | 'pending';
  usd?: number;
  /** Founder-supplied order of magnitude for a pending line; used only to explain a gap, never added. */
  estimateUsd?: number;
  source: string;
};

// TODO(founder): replace with a real adapter once the referral rewards endpoint is public.
export const REFERRAL_REWARDS_PENDING: LiabilityComponent = {
  name: 'Referral rewards', status: 'pending', estimateUsd: 25_000, source: 'pending (not yet exposed by Strike)',
};

export function liabilityBreakdown(
  scan: { totalUsd: number; stakingRewardsUsd: number },
  pending: LiabilityComponent[] = [REFERRAL_REWARDS_PENDING],
): { components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number } {
  const components: LiabilityComponent[] = [
    { name: 'margin_balance', status: 'exposed', usd: scan.totalUsd, source: 'GET /v2/account' },
    { name: 'Staking rewards', status: 'exposed', usd: scan.stakingRewardsUsd, source: 'GET /v2/balances stakingRewardBalance' },
    ...pending,
  ];
  return {
    components,
    exposedUsd: components.reduce((s, c) => s + (c.status === 'exposed' ? c.usd ?? 0 : 0), 0),
    pendingEstimateUsd: pending.reduce((s, c) => s + (c.estimateUsd ?? 0), 0),
  };
}
