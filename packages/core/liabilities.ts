/**
 * Liabilities = what users can actually withdraw (founder, 22 Oct 14:30): "make sure to discount rewards, since they are
 * only tradeable and not withdrawable". So:
 *  - margin_balance counts;
 *  - lockedRewards (docs: "rewards still locked against withdrawal", tradeable inside the balance) are subtracted;
 *  - stakingRewardBalance (docs: "segregated; excluded from margin and withdrawals") and referral rewards are not added.
 * Excluded lines stay visible so the method is auditable.
 */
export type LiabilityComponent = {
  name: string;
  /** counted: added · deducted: subtracted · excluded: shown, not counted (not withdrawable). */
  status: 'counted' | 'deducted' | 'excluded';
  usd?: number;
  source: string;
};

export function liabilityBreakdown(scan: { totalUsd: number; stakingRewardsUsd: number; lockedRewardsUsd: number }): {
  components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number;
} {
  const components: LiabilityComponent[] = [
    { name: 'margin_balance', status: 'counted', usd: scan.totalUsd, source: 'GET /v2/account' },
    { name: 'Locked rewards (not withdrawable)', status: 'deducted', usd: scan.lockedRewardsUsd, source: 'GET /v2/balances lockedRewards' },
    { name: 'Staking rewards (not withdrawable)', status: 'excluded', usd: scan.stakingRewardsUsd, source: 'GET /v2/balances stakingRewardBalance' },
    { name: 'Referral rewards (not withdrawable)', status: 'excluded', source: 'rewards are discounted per Strike' },
  ];
  return { components, exposedUsd: scan.totalUsd - scan.lockedRewardsUsd, pendingEstimateUsd: 0 };
}
