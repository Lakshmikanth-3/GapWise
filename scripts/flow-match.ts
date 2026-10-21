// FR-2.4 flow match: Strike-reported daily deposits/withdrawals vs on-chain locker flows, per chain per day.
// Usage: npx tsx scripts/flow-match.ts [days=7]
import { reportedTransfers } from '../packages/collectors/stats';
import { ethFlows, solanaFlows, cardanoFlows, bucketFlows } from '../packages/collectors/flows';
import { createPricer } from '../packages/collectors/prices';
import { flowCheck } from '../packages/core/flowCheck';

const days = Number(process.argv[2] ?? 7);
const since = Date.now() - days * 86_400_000;
const getPrice = createPricer();

const [reported, ...chains] = await Promise.all([
  reportedTransfers(),
  ethFlows(since, getPrice).catch(e => ({ error: `ethereum: ${e.message}` })),
  solanaFlows(since, getPrice).catch(e => ({ error: `solana: ${e.message}` })),
  cardanoFlows(since, getPrice).catch(e => ({ error: `cardano: ${e.message}` })),
]);
const ok = chains.filter((c): c is Exclude<typeof c, { error: string }> => !('error' in c));
for (const c of chains) if ('error' in c) console.error('!!', c.error);
const rows = flowCheck(reported, bucketFlows(ok.flatMap(c => c.flows)), ok.map(c => c.coverage));
for (const c of ok) console.log(`${c.coverage.chain}: ${c.flows.length} moves, coverage ${new Date(c.coverage.fromTs).toISOString()} → ${new Date(c.coverage.toTs).toISOString()}${c.coverage.note ? ` (${c.coverage.note})` : ''}`);
console.table(rows.map(r => ({ day: r.day, chain: r.chain, repIn: r.reportedIn.toFixed(2), chainIn: r.onchainIn.toFixed(2), in: `${r.matchInPct}%`, repOut: r.reportedOut.toFixed(2), chainOut: r.onchainOut.toFixed(2), out: `${r.matchOutPct}%`, cmp: r.comparable, mismatch: r.mismatch, unpriced: r.unpricedMoves })));
