/**
 * Liabilities = everything users can withdraw (founder, 22–23 Oct):
 *  + Σ account equity = wallet_balance + unrealized_pnl, non-vault accounts and sub-accounts             GET /v2/account
 *    (founder, 23 Oct 10:58; margin_balance leaves out isolated margin. lockedRewards sit inside wallet_balance: counted once)
 *  + Σ each depositor's current vault share (not inside equity)                                          GET /v2/vault/{id}/depositors
 *  + Σ stakingRewardBalance (withdrawable; not inside wallet_balance)                                    GET /v2/balances
 *  + Commission balances (withdrawable): not exposed by Strike yet → pending line, no value, never guessed.
 * Double-counting evidence per component: docs/DECISIONS.md #38, #48, #49, #50.
 */
export type LiabilityComponent = {
  name: string;
  /** counted: added · included: already inside a counted line (shown for transparency) · pending: no public source yet. */
  status: 'counted' | 'included' | 'pending';
  usd?: number;
  source: string;
  note?: string;
};

export function liabilityBreakdown(scan: { totalUsd: number; lockedRewardsUsd: number; vaultSharesUsd?: number; stakingRewardsUsd?: number; marginBalanceUsd?: number }): {
  components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number;
} {
  const vault = scan.vaultSharesUsd ?? 0, staking = scan.stakingRewardsUsd ?? 0;
  const components: LiabilityComponent[] = [
    { name: 'account_equity', status: 'counted', usd: scan.totalUsd, source: 'GET /v2/account wallet_balance + unrealized_pnl' },
    ...(scan.marginBalanceUsd === undefined ? [] : [{ name: 'Isolated-margin equity (inside account equity; missing from margin_balance)', status: 'included' as const, usd: scan.totalUsd - scan.marginBalanceUsd, source: 'equity − Σ margin_balance' }]),
    { name: 'Locked rewards (inside wallet_balance, counted as owed)', status: 'included', usd: scan.lockedRewardsUsd, source: 'GET /v2/balances lockedRewards' },
    { name: 'Vault shares held by depositors', status: 'counted', usd: vault, source: 'GET /v2/vault/{id}/depositors current_equity' },
    { name: 'Staking rewards (withdrawable)', status: 'counted', usd: staking, source: 'GET /v2/balances stakingRewardBalance' },
    // TODO(adapter): add the commission source as soon as Strike exposes it.
    { name: 'Commission — pending (not yet exposed by Strike)', status: 'pending', source: 'not exposed by Strike yet', note: 'withdrawable; no value until Strike exposes it' },
  ];
  return { components, exposedUsd: scan.totalUsd + vault + staking, pendingEstimateUsd: 0 };
}
