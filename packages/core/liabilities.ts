/**
 * Liabilities = everything users can withdraw (founder, 22–23 Oct):
 *  + Σ margin_balance of non-vault accounts and sub-accounts (lockedRewards included, NOT subtracted)  GET /v2/account
 *  + Σ each depositor's current vault share (not inside margin_balance)                                GET /v2/vault/{id}/depositors
 *  + Σ stakingRewardBalance (withdrawable; segregated, not inside margin_balance)                       GET /v2/balances
 *  + Commission balances (withdrawable): not exposed by Strike yet → pending line, no value, never guessed.
 * Double-counting evidence per component: docs/DECISIONS.md #38, #48, #49.
 */
export type LiabilityComponent = {
  name: string;
  /** counted: added · included: already inside a counted line (shown for transparency) · pending: no public source yet. */
  status: 'counted' | 'included' | 'pending';
  usd?: number;
  source: string;
  note?: string;
};

export function liabilityBreakdown(scan: { totalUsd: number; lockedRewardsUsd: number; vaultSharesUsd?: number; stakingRewardsUsd?: number }): {
  components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number;
} {
  const vault = scan.vaultSharesUsd ?? 0, staking = scan.stakingRewardsUsd ?? 0;
  const components: LiabilityComponent[] = [
    { name: 'margin_balance', status: 'counted', usd: scan.totalUsd, source: 'GET /v2/account' },
    { name: 'Locked rewards (inside margin_balance, counted as owed)', status: 'included', usd: scan.lockedRewardsUsd, source: 'GET /v2/balances lockedRewards' },
    { name: 'Vault shares held by depositors', status: 'counted', usd: vault, source: 'GET /v2/vault/{id}/depositors current_equity' },
    { name: 'Staking rewards (withdrawable)', status: 'counted', usd: staking, source: 'GET /v2/balances stakingRewardBalance' },
    // TODO(adapter): add the commission source as soon as Strike exposes it.
    { name: 'Commission — pending (not yet exposed by Strike)', status: 'pending', source: 'not exposed by Strike yet', note: 'withdrawable; no value until Strike exposes it' },
  ];
  return { components, exposedUsd: scan.totalUsd + vault + staking, pendingEstimateUsd: 0 };
}
