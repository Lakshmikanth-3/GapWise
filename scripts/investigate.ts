// `npm run investigate` — run the GapWise Gap Investigator on the latest verified report (or --report <file>).
// `--fresh` first runs `npm run verify` (a live scan, ~3 min) and investigates that report.
// `--publish` also publishes the scan's tables to Zetaris (requires ZETARIS_* and the tables from docs/zetaris/schema.sql).
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import type { ScanReport } from '../packages/core/report';
import { depsFromEnv, integrationStatus } from '../packages/agent/deps';
import { investigate, saveInvestigation } from '../packages/agent/investigate';
import { buildTables, publishScan } from '../packages/zetaris/tables';

async function main() {
  const args = process.argv.slice(2);
  const deps = await depsFromEnv();
  const status = await integrationStatus(deps);
  console.error(`GapWise investigate · Meterless: ${status.meterless.state}${status.meterless.detail ? ` (${status.meterless.detail})` : ''} · Zetaris: ${status.zetaris.state}${status.zetaris.detail ? ` (${status.zetaris.detail})` : ''} · H-MEM: ${status.memory.records} records`);
  if (status.meterless.state !== 'online') deps.llm = undefined; // fall back to rules-only, labelled as such

  let report: ScanReport;
  const i = args.indexOf('--report');
  if (args.includes('--fresh')) {
    const { runVerify } = await import('./verify');
    ({ report } = await runVerify(undefined, s => console.error(s)));
    deps.reports!.set(report.content_sha256.slice(0, 16), report);
  } else if (i >= 0) report = JSON.parse(await readFile(args[i + 1], 'utf8'));
  else {
    report = [...deps.reports!.values()].filter(r => r.network === (process.env.ZEROGAP_NETWORK ?? 'mainnet')).sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0];
    if (!report) throw new Error('no report in reports/; run npm run verify first or pass --fresh');
  }
  if (args.includes('--publish')) {
    if (!deps.zetaris) throw new Error('--publish needs ZETARIS_* configuration');
    console.error('Zetaris publish:', await publishScan(deps.zetaris, buildTables(report)));
  }
  const inv = await investigate(report, deps, 'cli');
  const file = await saveInvestigation(inv);
  console.log(JSON.stringify(inv, null, 1));
  console.error(`\nSaved ${file}\n${inv.verdict}\nunexplained ${inv.unexplained_usd} · ${inv.rules_only ? 'rules-only' : inv.model}`);
}

main().then(() => process.exit(0), e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
