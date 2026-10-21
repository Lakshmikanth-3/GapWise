// FR-1.1: read and price all lockers every 60 s and store each run in reserve_snapshots.
import { snapshotReserves } from '../packages/collectors/reserves';
import { createPricer } from '../packages/collectors/prices';
import { openStore, toReserveRows } from '../packages/db/queries';

const INTERVAL_MS = Number(process.env.RESERVES_INTERVAL_MS ?? 60_000);

async function main() {
  const store = await openStore();
  const getPrice = createPricer(); // one pricer keeps the last-good price across runs
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap a slow run
    running = true;
    try {
      const s = await snapshotReserves(getPrice);
      await store.insert('reserve_snapshots', toReserveRows(s.ts, s.rows));
      console.log(`${new Date(s.ts).toISOString()} reserves $${s.pricedUsd.toLocaleString('en-US')} rows=${s.rows.length} unpriced=${s.unpriced.length}${s.failedChains.length ? ` FAILED=${s.failedChains}` : ''}${s.stalePrices ? ' STALE' : ''}`);
    } catch (e) { console.error('reserves tick failed:', (e as Error).message); }
    finally { running = false; }
  };
  await tick();
  if (process.argv.includes('--once')) return store.close();
  setInterval(tick, INTERVAL_MS);
}
main().catch(e => { console.error(e); process.exit(1); });
