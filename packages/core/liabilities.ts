/**
 * Liabilities = what users can actually withdraw (founder, 22 Oct): rewards are tradeable only, not withdrawable, so they
 * are not backed by the lockers. Evidence (live /v2/balances, see docs/DECISIONS.md #38):
 *  - lockedRewards IS inside margin_balance (walletBalance − lockedRewards = maxWithdrawAmount) → subtracted;
 *  - stakingRewardBalance is NOT inside margin_balance (segregated) → simply not added.
 * Vault accounts are excluded (no double counting), but depositors' vault shares are NOT inside their own margin_balance
 * (founder, 22 Oct 23:33: "maybe your code didn't pick up people's vault shares"), so they are added per depositor.
 */
export type LiabilityComponent = {
  name: string;
  /** counted: added · deducted: subtracted. */
  status: 'counted' | 'deducted';
  usd: number;
  source: string;
};

export function liabilityBreakdown(scan: { totalUsd: number; lockedRewardsUsd: number; vaultSharesUsd?: number }): {
  components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number;
} {
  const components: LiabilityComponent[] = [
    { name: 'margin_balance', status: 'counted', usd: scan.totalUsd, source: 'GET /v2/account' },
    { name: 'Locked rewards inside margin_balance (not withdrawable)', status: 'deducted', usd: scan.lockedRewardsUsd, source: 'GET /v2/balances lockedRewards' },
    { name: 'Vault shares held by depositors', status: 'counted', usd: scan.vaultSharesUsd ?? 0, source: 'GET /v2/vault/{id}/depositors current_equity' },
  ];
  return { components, exposedUsd: scan.totalUsd - scan.lockedRewardsUsd + (scan.vaultSharesUsd ?? 0), pendingEstimateUsd: 0 };
}
