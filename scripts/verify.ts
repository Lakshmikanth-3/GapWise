// `npm run verify` — recompute Strike Finance's reserve ratio from scratch using only public data, and write the full
// input set to reports/<network>-<timestamp>.json so anyone can diff it against ZeroGap's published scan.
// No keys are required; ETH_RPC_URL / SOLANA_RPC_URL / BLOCKFROST_PROJECT_ID (free tiers) only make it faster.
import { mkdir, writeFile } from 'node:fs/promises';
import { scanLiabilities } from '../packages/collectors/accounts';
import { snapshotReserves } from '../packages/collectors/reserves';
import { createSnapshotPricer } from '../packages/collectors/prices';
import { buildReport, reportFileName } from '../packages/core/report';
import { env } from '../packages/core/config';

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export async function runVerify(outDir = process.env.ZEROGAP_REPORTS_DIR ?? 'reports', log: (s: string) => void = console.log) {
  log(`ZeroGap verify · ${env.network.toUpperCase()} · Strike API ${env.strikeApi} · RPCs: ETH ${new URL(env.ethRpc()).host}, SOL ${new URL(env.solRpc()).host}, Cardano ${env.blockfrost() ? 'Blockfrost' : 'Koios (public)'}`);
  log('Scanning every Strike account (≈3 min at ≤40 req/s)…');
  const liab = await scanLiabilities();
  const snap = createSnapshotPricer();
  const reserves = await snapshotReserves(snap.getPrice);
  const report = buildReport({ liab, reserves, priceSnapshotAt: snap.takenAt(), strikeApi: env.strikeApi, network: env.network });

  log(`\nReserves by chain and address (price snapshot ${report.timing.price_snapshot_at}):`);
  for (const r of report.reserves.rows) {
    log(`  ${r.chain.padEnd(8)} ${String(r.address).padEnd(60)} ${r.asset.padEnd(22)} ${String(r.amount).padStart(20)}  ${r.price_usd === null ? 'UNPRICED' : `× ${r.price_usd} = ${usd(r.usd_value)}`}`);
  }
  log(`  total priced: ${usd(report.reserves.priced_usd)}${report.reserves.unpriced.length ? ` · unpriced: ${report.reserves.unpriced.map(u => `${u.asset} ${u.amount}`).join(', ')}` : ''}`);
  if (report.reserves.failed_chains.length) log(`  !! failed chains: ${report.reserves.failed_chains.join(', ')}`);
  const l = report.liabilities;
  log(`\nLiabilities: ${l.accounts_listed} listed · ${l.vaults_excluded} vaults excluded · ${l.subaccounts_discovered} sub-accounts · ${l.accounts_read} read · ${l.accounts_failed.length} failed [${l.confidence}]`);
  log(`  Σ account equity (wallet_balance + unrealized_pnl) ${usd(l.account_equity_usd)} (incl. locked rewards ${usd(l.locked_rewards_usd)}; isolated margin missing from margin_balance ${usd(l.isolated_margin_usd)}) + Σ vault shares ${usd(l.vault_shares_usd)} + Σ staking rewards ${usd(l.staking_rewards_usd)} = ${usd(l.total_usd)} · commission: pending (not yet exposed by Strike)`);
  const res = report.result;
  log(`\nRatio: ${res.ratio === null ? 'n/a' : (res.ratio * 100).toFixed(4) + '%'} → ${res.status} · ${res.gap_text}`);
  log(`
Vault cross-check (excluded vault accounts vs Σ depositor shares counted as liabilities):`);
  for (const p of res.vault_crosscheck.per_vault) log(`  ${p.vault_id}  vault ${usd(p.vault_account_usd).padStart(16)}  shares ${usd(p.depositor_shares_usd).padStart(16)}  (${p.depositors} depositors)  diff ${usd(p.difference_usd)}`);
  log(`  total vault ${usd(res.vault_crosscheck.vault_accounts_usd)} · shares ${usd(res.vault_crosscheck.depositor_shares_usd)} · diff ${usd(res.vault_crosscheck.difference_usd)}`);
  for (const n of res.open_notes) log(`  note: ${n}`);

  await mkdir(outDir, { recursive: true });
  const file = `${outDir}/${reportFileName(report)}`;
  await writeFile(file, JSON.stringify(report, null, 1));
  log(`\nReport: ${file}\n  sha256 ${report.content_sha256} · code ${report.code_commit}`);
  return { report, file };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/verify.ts')) {
  runVerify().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
}
