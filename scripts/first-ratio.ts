import { scanLiabilities } from '../packages/collectors/accounts';
import { snapshotReserves } from '../packages/collectors/reserves';
import { createSnapshotPricer } from '../packages/collectors/prices';
import { assessRatio, confidence, formatGap, IN_TRANSIT, type Assessment } from '../packages/core/ratio';
import { liabilityBreakdown } from '../packages/core/liabilities';

const pct = (r?: number) => (r === undefined ? 'n/a' : `${(r * 100).toFixed(4)}%`);
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const show = (a: Assessment) => `${pct(a.ratio)} → ${a.status} · ${formatGap(a)}${a.explainedBy ? ` (${a.explainedBy})` : ''}`;

async function main() {
  // Liability scan first; reserves are read right after it with ONE price snapshot, so both sides are timestamped together.
  const liab = await scanLiabilities();
  const snap = createSnapshotPricer();
  const v = await snapshotReserves(snap.getPrice);
  if (v.failedChains.length) console.error(`!! collectors failed: ${v.failedChains.join(', ')} — ratio is NOT valid`);
  if (!v.custodyScale.applied) console.error(`!! Strike custody mappings unavailable (${v.custodyScale.error}); collector decimals used`);

  console.log('\n=== Reserves by chain and address (one price snapshot) ===');
  for (const chain of ['ethereum', 'solana', 'cardano'] as const) {
    const rows = v.rows.filter(r => r.chain === chain);
    console.log(`\n${chain.toUpperCase()} — ${usd(rows.reduce((s, r) => s + (r.usdValue ?? 0), 0))}`);
    console.table(rows.map(r => ({
      address: r.holder, owner: r.owner ?? '', asset: r.asset.slice(0, 22), amount: r.amount,
      price: r.quote.usd ?? 'UNPRICED', status: r.quote.status, source: r.quote.source.replace('https://api.strikefinance.org', '').slice(0, 44), usd: r.usdValue ?? '-',
    })));
  }
  console.log('\n=== Unpriced reserves (not in the ratio) ===');
  if (!v.unpriced.length) console.log('  none');
  for (const u of v.unpriced) console.log(`  ${u.chain}  ${u.asset}  ${u.amount}  — ${u.quote.source}`);

  const c = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  const b = liabilityBreakdown(liab);
  console.log('\n=== Liabilities (withdrawable) ===');
  console.log(`Accounts listed: ${liab.listed} | vaults excluded: ${liab.excludedVaults} | sub-accounts discovered: ${liab.discovered} | read: ${liab.read} | failed: ${liab.failed.length} | negative: ${liab.negative.length}  [${c.label}]`);
  console.log(`Scan window: ${new Date(liab.startedAt).toISOString()} → ${new Date(liab.ts).toISOString()} · price snapshot ${new Date(snap.takenAt() ?? v.ts).toISOString()}`);
  console.table([
    ...b.components.map(x => ({ component: x.name, status: x.status, usd: usd(x.usd), source: x.source })),
    { component: 'TOTAL', status: '', usd: usd(b.exposedUsd), source: 'Σ margin_balance − Σ lockedRewards' },
  ]);
  console.log(`Rewards evidence: lockedRewards inside walletBalance for ${liab.lockedInWallet.consistent} account(s), not for ${liab.lockedInWallet.inconsistent} · stakingRewardBalance Σ ${usd(liab.stakingRewardsUsd)} is separate (not added)`);

  const common = { reservesUsd: v.pricedUsd, unpricedReserves: v.unpriced.length, pendingLiabilityEstimateUsd: b.pendingEstimateUsd };
  console.log('\n=== Ratio ===');
  console.log(`Priced reserves ${usd(v.pricedUsd)} · liabilities ${usd(b.exposedUsd)}${v.stalePrices ? ' · [STALE PRICES]' : ''}`);
  console.log(`Vaults EXCLUDED (founder rule, published): ${show(assessRatio({ ...common, liabilitiesUsd: b.exposedUsd }))}`);
  console.log(`Vaults INCLUDED (audit, ${usd(liab.vaultsUsd)}):      ${show(assessRatio({ ...common, liabilitiesUsd: b.exposedUsd + liab.vaultsUsd }))}`);
  console.log(`In-transit tolerance $${IN_TRANSIT.toleranceUsd.toLocaleString('en-US')}: ${IN_TRANSIT.note}`);
}
main().catch(e => { console.error(e); process.exit(1); });
