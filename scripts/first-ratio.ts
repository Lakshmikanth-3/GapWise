import { scanLiabilities } from '../packages/collectors/accounts';
import { snapshotReserves } from '../packages/collectors/reserves';
import { createPricer } from '../packages/collectors/prices';
import { assessRatio, confidence, type Assessment } from '../packages/core/ratio';
import { liabilityBreakdown } from '../packages/core/liabilities';

const pct = (r?: number) => (r === undefined ? 'n/a' : `${(r * 100).toFixed(4)}%`);
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const show = (a: Assessment) => `${pct(a.ratio)} → ${a.status}${a.explainedBy ? ` (explained by ${a.explainedBy})` : ''}`;

async function main() {
  const getPrice = createPricer();
  // Reserves are read at both edges of the account scan; balances move while it runs.
  const [before, liab] = await Promise.all([snapshotReserves(getPrice), scanLiabilities()]);
  const v = await snapshotReserves(getPrice);
  if (v.failedChains.length) console.error(`!! collectors failed: ${v.failedChains.join(', ')} — ratio is NOT valid`);

  console.log('\n=== Reserves by locker (read at end of scan) ===');
  const byHolder = new Map<string, typeof v.rows>();
  for (const r of v.rows) { const k = `${r.chain} ${r.holder ?? ''}`; byHolder.set(k, [...(byHolder.get(k) ?? []), r]); }
  for (const [k, rows] of byHolder) {
    console.log(`\n${k}`);
    console.table(rows.map(r => ({ asset: r.asset.slice(0, 24), amount: r.amount, usdPrice: r.quote.usd ?? 'UNPRICED', status: r.quote.status, source: r.quote.source.slice(0, 48), usdValue: r.usdValue ?? '-' })));
  }

  console.log('\n=== Unpriced reserves (not in the priced ratio) ===');
  for (const u of v.unpriced) console.log(`  ${u.chain}  ${u.asset}  ${u.amount}  — ${u.quote.source}`);

  const c = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  const b = liabilityBreakdown(liab);
  console.log('\n=== Liabilities ===');
  console.log(`Accounts listed: ${liab.listed} | vaults excluded: ${liab.excludedVaults} | sub-accounts discovered: ${liab.discovered} | read: ${liab.read} | failed: ${liab.failed.length} | negative: ${liab.negative.length}  [${c.label}]`);
  console.log(`Scan window: ${new Date(liab.startedAt).toISOString()} → ${new Date(liab.ts).toISOString()}`);
  console.table([
    ...b.components.map(x => ({ component: x.name, status: x.status, usd: x.usd !== undefined ? usd(x.usd) : "-", source: x.source })),
    { component: "TOTAL (withdrawable liabilities)", status: "", usd: usd(b.exposedUsd), source: "margin_balance - lockedRewards" },
  ]);
  console.log(`lockedRewards inside walletBalance for ${liab.lockedInWallet.consistent} account(s), not for ${liab.lockedInWallet.inconsistent}`);

  const common = { reservesUsd: v.pricedUsd, unpricedReserves: v.unpriced.length, pendingLiabilityEstimateUsd: b.pendingEstimateUsd };
  console.log('\n=== Ratio (priced reserves only) ===');
  console.log(`Priced reserves: ${usd(v.pricedUsd)} at ${new Date(v.ts).toISOString()} (start-of-scan ${usd(before.pricedUsd)}, moved ${usd(v.pricedUsd - before.pricedUsd)})${v.stalePrices ? ' [STALE PRICES]' : ''}`);
  console.log(`Vaults EXCLUDED (founder rule, published): ${show(assessRatio({ ...common, liabilitiesUsd: b.exposedUsd }))}`);
  console.log(`Vaults INCLUDED (audit, ${usd(liab.vaultsUsd)}): ${show(assessRatio({ ...common, liabilitiesUsd: b.exposedUsd + liab.vaultsUsd }))}`);
  console.log(`Incl. unpriced reserves: n/a — ${v.unpriced.length} asset(s) awaiting the official Strike price API`);
}
main().catch(e => { console.error(e); process.exit(1); });
