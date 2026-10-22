// Verifiable scan report: every input needed to recompute the ratio, as plain JSON (no signatures, nothing hidden).
// Produced identically by `npm run verify` and by the published engine, so anyone can diff their run against ours.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import type { LiabilityScan } from '../collectors/accounts';
import type { ReserveSnapshot } from '../collectors/reserves';
import { LOCKERS } from './config';
import { assessRatio, confidence, formatGap, IN_TRANSIT } from './ratio';
import { liabilityBreakdown } from './liabilities';

export const REPORT_VERSION = 1;

export const RULES = [
  'Reserves: on-chain balances of every Strike locker (Ethereum vault; Solana vault account, its treasury PDA and the named USDC token account, de-duplicated; both Cardano scripts).',
  'Prices: Strike /price/v2/premiumIndex index price for ADA/ETH/SOL; Strike /v2/credit/collateral-assets for sUSDrf, LP_SUNDAE_USDCx_USDM and scaled aUSDC; fiat-redeemable stablecoins (USDC, USDT, USDCx, USDM) at the 1:1 peg by contract id; anything else unpriced and excluded.',
  'Raw on-chain amounts of Credit custody assets are scaled with /v2/credit/settings raw_amount_scale.',
  'Liabilities: Σ margin_balance of every non-vault leaderboard account plus discovered sub-accounts, minus Σ lockedRewards (inside margin_balance, not withdrawable). stakingRewardBalance and referral rewards are not withdrawable and not added.',
  'Vault accounts (vault_id / vault_ prefix) are excluded per the founder; their total is reported as an audit figure only.',
  'One price snapshot values every reserve row; it is taken right after the account scan and both are timestamped.',
  'Status: Balanced within ±0.01%, Drift up to ±1%, Needs review beyond; a gap within the founder-stated in-transit amount is "In transit".',
];

export function codeCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

export function buildReport(p: { liab: LiabilityScan; reserves: ReserveSnapshot; priceSnapshotAt?: number; network?: string; commit?: string; strikeApi: string }) {
  const { liab, reserves } = p;
  const b = liabilityBreakdown(liab);
  const common = { reservesUsd: reserves.pricedUsd, unpricedReserves: reserves.unpriced.length, pendingLiabilityEstimateUsd: b.pendingEstimateUsd };
  const published = assessRatio({ ...common, liabilitiesUsd: b.exposedUsd });
  const audit = assessRatio({ ...common, liabilitiesUsd: b.exposedUsd + liab.vaultsUsd });
  const conf = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  const body = {
    report_version: REPORT_VERSION,
    product: 'ZeroGap — independent proof-of-solvency monitor for Strike Finance (not affiliated with Strike Finance)',
    network: p.network ?? 'mainnet',
    generated_at: new Date().toISOString(),
    code_commit: p.commit ?? codeCommit(),
    rules: RULES,
    sources: {
      strike_api: p.strikeApi,
      endpoints: ['/stat/v1/stats/leaderboard', '/v2/account', '/v2/balances', '/price/v2/premiumIndex', '/v2/credit/collateral-assets', '/v2/credit/settings'],
      lockers: LOCKERS,
    },
    timing: {
      liability_scan: { started_at: new Date(liab.startedAt).toISOString(), finished_at: new Date(liab.ts).toISOString() },
      reserves_read_at: new Date(reserves.ts).toISOString(),
      price_snapshot_at: p.priceSnapshotAt ? new Date(p.priceSnapshotAt).toISOString() : null,
    },
    reserves: {
      priced_usd: reserves.pricedUsd,
      stale_prices: reserves.stalePrices,
      failed_chains: reserves.failedChains,
      custody_scale: reserves.custodyScale,
      rows: reserves.rows.map(r => ({
        chain: r.chain, address: r.holder ?? null, owner: r.owner ?? null, asset: r.asset, contract: r.contract ?? null,
        raw: r.raw ?? null, decimals: r.decimals ?? null, amount: r.amount,
        price_usd: r.quote.usd ?? null, price_status: r.quote.status, price_source: r.quote.source, price_ts: r.quote.ts,
        usd_value: r.usdValue ?? null,
      })),
      unpriced: reserves.unpriced.map(u => ({ chain: u.chain, asset: u.asset, amount: u.amount, reason: u.quote.source })),
    },
    liabilities: {
      accounts_listed: liab.listed, vaults_excluded: liab.excludedVaults, subaccounts_discovered: liab.discovered,
      accounts_read: liab.read, accounts_failed: liab.failed, negative_accounts: liab.negative, confidence: conf.label,
      margin_balance_usd: liab.totalUsd, locked_rewards_usd: liab.lockedRewardsUsd,
      staking_rewards_usd_not_counted: liab.stakingRewardsUsd,
      total_usd: b.exposedUsd,
      vaults_audit_usd: liab.vaultsUsd,
      accounts: liab.accounts, vaults: liab.vaults,
    },
    result: {
      ratio: published.ratio ?? null, status: published.status ?? null, explained_by: published.explainedBy ?? null,
      gap_usd: published.gapUsd ?? null, gap_pct: published.gapPct ?? null, gap_text: formatGap(published),
      in_transit: { tolerance_usd: IN_TRANSIT.toleranceUsd, note: IN_TRANSIT.note },
      audit_vaults_included: { ratio: audit.ratio ?? null, gap_usd: audit.gapUsd ?? null, gap_pct: audit.gapPct ?? null },
    },
  };
  const json = JSON.stringify(body);
  return { ...body, content_sha256: createHash('sha256').update(json).digest('hex') };
}

export type ScanReport = ReturnType<typeof buildReport>;
export const reportFileName = (r: { generated_at: string; network: string }) => `${r.network}-${r.generated_at.replace(/[:.]/g, '-')}.json`;
