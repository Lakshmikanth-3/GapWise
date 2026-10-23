// Verifiable scan report: every input needed to recompute the ratio, as plain JSON (no signatures, nothing hidden).
// Produced identically by `npm run verify` and by the published engine, so anyone can diff their run against ours.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { equityOf, type LiabilityScan } from '../collectors/accounts';
import type { ReserveSnapshot } from '../collectors/reserves';
import { LOCKERS, NETWORK } from './config';
import { assessRatio, confidence, formatGap, IN_TRANSIT } from './ratio';
import { liabilityBreakdown } from './liabilities';

export const REPORT_VERSION = 2;

export const RULES = [
  'Reserves: on-chain balances of every Strike locker (Ethereum vault; Solana vault account, its treasury PDA and the named USDC token account, de-duplicated; both Cardano scripts).',
  'Prices: Strike /price/v2/premiumIndex index price for ADA/ETH/SOL; Strike /v2/credit/collateral-assets for sUSDrf, LP_SUNDAE_USDCx_USDM and scaled aUSDC; fiat-redeemable stablecoins (USDC, USDT, USDCx, USDM) at the 1:1 peg by contract id; anything else unpriced and excluded.',
  'Raw on-chain amounts of Credit custody assets are scaled with /v2/credit/settings raw_amount_scale.',
  'Liabilities (everything withdrawable): Σ account equity = wallet_balance + unrealized_pnl of every non-vault leaderboard account plus discovered sub-accounts (founder, 23 Oct; margin_balance is not used because it leaves out isolated-margin positions; lockedRewards are inside wallet_balance and counted once), plus Σ depositor vault shares (/v2/vault/{id}/depositors; not inside equity), plus Σ stakingRewardBalance (withdrawable; not inside wallet_balance). Commission balances are withdrawable too; public source pending, listed as a pending line.',
  'Vault accounts (vault_id / vault_ prefix) are excluded so nothing is double counted; their equity is a cross-check that should equal Σ depositor shares.',
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
  const conf = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  const body = {
    report_version: REPORT_VERSION,
    product: 'ZeroGap — independent proof-of-solvency monitor for Strike Finance (not affiliated with Strike Finance)',
    network: p.network ?? NETWORK,
    generated_at: new Date().toISOString(),
    code_commit: p.commit ?? codeCommit(),
    rules: RULES,
    sources: {
      strike_api: p.strikeApi,
      endpoints: ['/stat/v1/stats/leaderboard', '/v2/account', '/v2/balances', '/v2/vault/{id}/depositors', '/price/v2/premiumIndex', '/v2/credit/collateral-assets', '/v2/credit/settings'],
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
      account_equity_usd: liab.totalUsd, margin_balance_usd: liab.marginBalanceUsd, isolated_margin_usd: liab.totalUsd - liab.marginBalanceUsd, locked_rewards_usd: liab.lockedRewardsUsd, vault_shares_usd: liab.vaultSharesUsd, staking_rewards_usd: liab.stakingRewardsUsd, commission_usd: null,
      total_usd: b.exposedUsd,
      vault_accounts_crosscheck_usd: liab.vaultsUsd,
      accounts: liab.accounts, vaults: liab.vaults, vault_shares: liab.vaultShares,
    },
    result: {
      ratio: published.ratio ?? null, status: published.status ?? null, explained_by: published.explainedBy ?? null,
      gap_usd: published.gapUsd ?? null, gap_pct: published.gapPct ?? null, gap_text: formatGap(published),
      open_notes: openNotes(liab, reserves),
      in_transit: { tolerance_usd: IN_TRANSIT.toleranceUsd, note: IN_TRANSIT.note },
      vault_crosscheck: { vault_accounts_usd: liab.vaultsUsd, depositor_shares_usd: liab.vaultSharesUsd, difference_usd: liab.vaultsUsd - liab.vaultSharesUsd, per_vault: perVault(liab) },
    },
  };
  const json = JSON.stringify(body);
  return { ...body, content_sha256: createHash('sha256').update(json).digest('hex') };
}

/** Per vault: the vault account's own equity vs Σ its depositors' current_equity (leader capital, rounding, timing). */
export function perVault(liab: Pick<LiabilityScan, 'vaults' | 'vaultShares'>) {
  return liab.vaults.map(v => {
    const shares = liab.vaultShares.filter(s => s.vault_id === v.vault_id);
    const sum = shares.reduce((s, x) => s + Number(x.current_equity), 0);
    const eq = equityOf(v);
    return { vault_id: v.vault_id, vault_account_usd: eq, depositor_shares_usd: sum, depositors: shares.length, difference_usd: eq - sum };
  });
}

/** Open items shown as notes until the founder answers (never folded into the numbers). */
export function openNotes(liab: Pick<LiabilityScan, 'vaults' | 'vaultShares'>, reserves: Pick<ReserveSnapshot, 'rows'>): string[] {
  const notes: string[] = ['Commission balances are withdrawable liabilities; their public source is pending from Strike, so they are not added yet.',
    'Locked rewards are inside wallet_balance and counted once as owed (founder, 23 Oct).'];
  for (const v of perVault(liab)) if (Math.abs(v.difference_usd) > 10) notes.push(`Vault ${v.vault_id}: vault account ${v.vault_account_usd.toFixed(2)} vs Σ depositor shares ${v.depositor_shares_usd.toFixed(2)} (difference ${v.difference_usd.toFixed(2)}): acknowledged by Strike, ignored for now.`);
  notes.push('Strike hedging bot 0x6139…1937: Lighter equity is counted as a reserve; its Aster balance has no public read yet and is not counted (founder, 23 Oct).');
  for (const r of reserves.rows) if (r.quote.status === 'placeholder') notes.push(`${r.asset} (${r.chain}) counted at a placeholder price of ${r.quote.usd}; price source pending from Strike.`);
  return notes;
}

export type ScanReport = ReturnType<typeof buildReport>;
export const reportFileName = (r: { generated_at: string; network: string }) => `${r.network}-${r.generated_at.replace(/[:.]/g, '-')}.json`;
