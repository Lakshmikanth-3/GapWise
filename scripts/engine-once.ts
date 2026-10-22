// One engine cycle for scheduled runners (GitHub Actions → Vercel). Reads/writes state in ZEROGAP_DATA_DIR,
// then publishes the public snapshot + history that the Vercel API serves. Same code as the always-on server.
import { writeFile } from 'node:fs/promises';
import { Engine } from '../apps/server/engine';
import { snapshot } from '../apps/server/snapshot';

const DATA = process.env.ZEROGAP_DATA_DIR ?? 'data';
const FLOWS_MS = Number(process.env.FLOWS_INTERVAL_MS ?? 30 * 60_000);

const engine = new Engine();
await engine.init();
const t0 = Date.now();
await engine.safetyJob();
await engine.scanJob(); // includes a fresh reserves read paired with the liability scan
if (!engine.state.flows || Date.now() - engine.state.flows.ts > FLOWS_MS) await engine.flowsJob();
await engine.alertJob();

await writeFile(`${DATA}/snapshot.json`, JSON.stringify(snapshot(engine.state)));
await writeFile(`${DATA}/history.json`, JSON.stringify(engine.state.history));
if (engine.lastReport) await writeFile(`${DATA}/latest-report.json`, JSON.stringify(engine.lastReport, null, 1));
const r = engine.state.ratio?.value;
console.log(`cycle done in ${((Date.now() - t0) / 1000).toFixed(0)} s · ratio ${r?.published.ratio?.toFixed(4)} ${r?.published.status} · errors ${JSON.stringify(engine.state.errors)}`);
process.exit(0);
