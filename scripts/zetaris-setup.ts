// `npm run zetaris:setup` — one-time data setup for the Zetaris data layer (idempotent; safe to re-run):
//   1. create the six GapWise tables in the store Postgres (GAPWISE_STORE_URL)
//   2. register that Postgres in Zetaris as the datasource `gapwise` and register its tables
//   3. publish every local verified report (reports/, input_examples/) so the agent has scan history
//   4. read the history back through Zetaris SQL, as the agent does
import 'dotenv/config';
import { ZetarisClient, zetarisFromEnv } from '../packages/zetaris/client';
import { publishScan, STORE_DDL, storeUrl, withStore } from '../packages/zetaris/store';
import { buildTables } from '../packages/zetaris/tables';
import { loadReports } from '../packages/agent/investigate';

const q = (s: string) => `"${s.replace(/"/g, '')}"`;

async function main() {
  const cfg = zetarisFromEnv();
  const store = storeUrl();
  const jdbc = process.env.GAPWISE_STORE_JDBC_URL, user = process.env.GAPWISE_STORE_USER, pass = process.env.GAPWISE_STORE_PASSWORD;
  if (!cfg || !store || !jdbc || !user || !pass) throw new Error('needs ZETARIS_* and GAPWISE_STORE_URL / _JDBC_URL / _USER / _PASSWORD (see .env.example)');
  const z = new ZetarisClient(cfg);

  await withStore(store, async c => { for (const sql of STORE_DDL) await c.query(sql); });
  console.log('1/4 store tables ready');

  try {
    await z.exec(`CREATE DATASOURCE ${cfg.schema} DESCRIBE BY ${q('GapWise scan tables')} OPTIONS (jdbcdriver "org.postgresql.Driver", jdbcurl ${q(jdbc)}, username ${q(user)}, password ${q(pass)}, fetchsize "1000")`);
    console.log(`2/4 Zetaris datasource "${cfg.schema}" created`);
  } catch (e) {
    if (!/exist/i.test((e as Error).message)) throw e;
    console.log(`2/4 Zetaris datasource "${cfg.schema}" already exists`);
  }
  try { await z.exec(`REGISTER DATASOURCE TABLES FROM ${cfg.schema}`); }
  catch (e) { if (!/exist|already/i.test((e as Error).message)) throw e; }
  console.log('    tables registered');

  const reports = new Map([...(await loadReports('input_examples')), ...(await loadReports())]);
  let rows = 0;
  for (const r of reports.values()) if (r.report_version >= 2) rows += (await publishScan(store, buildTables(r))).rows;
  console.log(`3/4 published ${reports.size} report(s), ${rows} rows`);

  const res = await z.runSql(`SELECT scan_id, ts, gap_usd, status FROM ${cfg.schema}.scans ORDER BY ts DESC LIMIT 10`);
  console.log(`4/4 read back through Zetaris in ${res.ms} ms: ${res.rows.length} scan(s)`);
  for (const r of res.rows) console.log(`    ${r.scan_id}  ${r.ts}  gap ${Math.round(Number(r.gap_usd))}  ${r.status}`);
}

main().then(() => process.exit(0), e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
