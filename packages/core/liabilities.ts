/**
 * Liabilities = what users can actually withdraw (founder, 22 Oct): rewards are tradeable only, not withdrawable, so they
 * are not backed by the lockers. Evidence (live /v2/balances, see docs/DECISIONS.md #38):
 *  - lockedRewards IS inside margin_balance (walletBalance − lockedRewards = maxWithdrawAmount) → subtracted;
 *  - stakingRewardBalance is NOT inside margin_balance (segregated) → simply not added.
 */
export type LiabilityComponent = {
  name: string;
  /** counted: added · deducted: subtracted. */
  status: 'counted' | 'deducted';
  usd: number;
  source: string;
};

export function liabilityBreakdown(scan: { totalUsd: number; lockedRewardsUsd: number }): {
  components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number;
} {
  const components: LiabilityComponent[] = [
    { name: 'margin_balance', status: 'counted', usd: scan.totalUsd, source: 'GET /v2/account' },
    { name: 'Locked rewards inside margin_balance (not withdrawable)', status: 'deducted', usd: scan.lockedRewardsUsd, source: 'GET /v2/balances lockedRewards' },
  ];
  return { components, exposedUsd: scan.totalUsd - scan.lockedRewardsUsd, pendingEstimateUsd: 0 };
}
