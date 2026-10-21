import { scanLiabilities } from '../packages/collectors/accounts';
import { ethReserves } from '../packages/collectors/ethereum';
import { cardanoReserves } from '../packages/collectors/cardano';
import { solanaReserves } from '../packages/collectors/solana';
import { createPriceFeed } from '../packages/collectors/prices';
import { valueReserves } from '../packages/core/valuation';
import { reserveRatio, confidence } from '../packages/core/ratio';
import type { Reserve } from '../packages/collectors/types';

async function settle(name: string, p: Promise<Reserve[]>): Promise<Reserve[]> {
  try { return await p; } catch (e) { console.error(`!! ${name} collector failed:`, (e as Error).message); return []; }
}

async function main() {
  const t0 = Date.now();
  const [eth, ada, sol, prices, liab] = await Promise.all([
    settle('ethereum', ethReserves()), settle('cardano', cardanoReserves()), settle('solana', solanaReserves()),
    createPriceFeed()(), scanLiabilities(),
  ]);
  const v = valueReserves([...eth, ...ada, ...sol], prices);
  console.table(v.rows.map(r => ({ chain: r.chain, asset: r.asset.slice(0, 20), amount: r.amount, usdPrice: r.usdPrice, usdValue: r.usdValue })));
  console.log('Reserves USD:', v.totalUsd.toLocaleString(), v.unpriced.length ? `(UNPRICED: ${v.unpriced.join(', ')})` : '');
  console.log('Accounts listed:', liab.listed, '| sub-accounts discovered:', liab.discovered, '| read:', liab.read, '| failed:', liab.failed.length, '| negative:', liab.negative.length);
  console.log('Liabilities USD (sum margin_balance):', liab.totalUsd.toLocaleString());
  const ratio = reserveRatio(v.totalUsd, liab.totalUsd);
  const c = confidence(liab.listed + liab.discovered, liab.read, Date.now() - liab.ts);
  console.log(`Reserve ratio: ${ratio === undefined ? 'n/a' : (ratio * 100).toFixed(2) + '%'} [${c.label}${c.failed ? `, ${c.failed} failed` : ''}] at ${new Date().toISOString()} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
main().catch(e => { console.error(e); process.exit(1); });
