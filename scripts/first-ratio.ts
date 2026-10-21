import { scanLiabilities } from '../packages/collectors/accounts';
import { ethReserves } from '../packages/collectors/ethereum';
import { cardanoReserves } from '../packages/collectors/cardano';
import { solanaReserves } from '../packages/collectors/solana';
import { createPriceFeed } from '../packages/collectors/prices';
import { valueReserves } from '../packages/core/valuation';
import { reserveRatio, ratioStatus, confidence } from '../packages/core/ratio';
import type { Reserve } from '../packages/collectors/types';

const pct = (r?: number) => (r === undefined ? 'n/a' : `${(r * 100).toFixed(4)}%`);
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function settle(name: string, p: Promise<Reserve[]>): Promise<Reserve[]> {
  try { return await p; } catch (e) { console.error(`!! ${name} collector failed:`, (e as Error).message); return []; }
}

async function snapshotReserves() {
  const ts = Date.now();
  const [eth, ada, sol, prices] = await Promise.all([
    settle('ethereum', ethReserves()), settle('cardano', cardanoReserves()), settle('solana', solanaReserves()), createPriceFeed()(),
  ]);
  return { ts, ...valueReserves([...eth, ...ada, ...sol], prices) };
}

async function main() {
  // Reserves are read at both edges of the account scan; balances move while it runs.
  const [before, liab] = await Promise.all([snapshotReserves(), scanLiabilities()]);
  const v = await snapshotReserves();

  console.log('\n=== Reserves by locker (read at end of scan) ===');
  const byHolder = new Map<string, typeof v.rows>();
  for (const r of v.rows) { const k = `${r.chain} ${r.holder ?? ''}`; byHolder.set(k, [...(byHolder.get(k) ?? []), r]); }
  for (const [k, rows] of byHolder) {
    console.log(`\n${k}`);
    console.table(rows.map(r => ({ asset: r.asset.slice(0, 24), amount: r.amount, usdPrice: r.usdPrice ?? 'UNPRICED', source: r.priceSource ?? '-', usdValue: r.usdValue ?? '-' })));
  }

  console.log('\n=== Unpriced assets (excluded from the main ratio; TODO: price source pending from founder) ===');
  for (const u of v.unpriced) console.log(`  ${u.chain}  ${u.asset}  ${u.amount}  (${u.contract ?? 'native'})`);

  const c = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  console.log('\n=== Liabilities ===');
  console.log(`Accounts listed: ${liab.listed} | vaults excluded: ${liab.excludedVaults} | sub-accounts discovered: ${liab.discovered} | read: ${liab.read} | failed: ${liab.failed.length} | negative: ${liab.negative.length}`);
  console.log(`Total liabilities (Σ margin_balance): ${usd(liab.totalUsd)}  [${c.label}${c.failed ? `, ${c.failed} failed` : ''}]`);
  console.log(`Scan window: ${new Date(liab.startedAt).toISOString()} → ${new Date(liab.ts).toISOString()}`);

  const ratio = reserveRatio(v.pricedUsd, liab.totalUsd);
  console.log('\n=== Ratio ===');
  console.log(`Priced reserves: ${usd(v.pricedUsd)} at ${new Date(v.ts).toISOString()} (start-of-scan read: ${usd(before.pricedUsd)}, moved ${usd(v.pricedUsd - before.pricedUsd)})${v.stalePrices ? ' [STALE PRICES]' : ''}`);
  console.log(`Ratio (priced assets only):      ${pct(ratio)}  → ${ratioStatus(ratio)}`);
  console.log(`Ratio (incl. unpriced assets):   n/a — ${v.unpriced.length} asset(s) awaiting a price source`);
  const alt = reserveRatio(v.pricedUsd, liab.totalUsd + liab.vaultsUsd);
  console.log(`AUDIT — if the ${liab.excludedVaults} vault accounts (${usd(liab.vaultsUsd)}) were included: ${pct(alt)} → ${ratioStatus(alt)} (priced assets only; not published)`);
}
main().catch(e => { console.error(e); process.exit(1); });
