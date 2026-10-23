// ZeroGap engine: collectors write, the engine computes, outputs (API, Telegram) only read results.
// A slow or failed source never blanks the state: the last good value is kept and marked with its age.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { scanLiabilities, type LiabilityScan } from '../../packages/collectors/accounts';
import { snapshotReserves, type ReserveSnapshot } from '../../packages/collectors/reserves';
import { createPricer, createSnapshotPricer } from '../../packages/collectors/prices';
import { reportedTransfers } from '../../packages/collectors/stats';
import { ethFlows, solanaFlows, cardanoFlows, bucketFlows, relayedCoverage, type Flow, type FlowCoverage } from '../../packages/collectors/flows';
import { ethSafetyState, ethSafetyEventsBetween, openItems, type EthSafetyState, type SafetyEvent } from '../../packages/collectors/safety';
import { client } from '../../packages/collectors/ethereum';
import { solanaSafetyFull, solanaInstructionEvents, type SolanaInstructionEvent } from '../../packages/collectors/solana-program';
import { assessRatio, confidence, formatGap, IN_TRANSIT, type Assessment } from '../../packages/core/ratio';
import { liabilityBreakdown, type LiabilityComponent } from '../../packages/core/liabilities';
import { flowCheck, type FlowCheckRow } from '../../packages/core/flowCheck';
import { evaluate, dedupe, type Alert } from '../../packages/alerts/rules';
import { formatAlert, sendTelegram, telegramFromEnv } from '../../packages/alerts/telegram';
import { openStore, toReserveRows, type Store } from '../../packages/db/queries';
import { buildReport, reportFileName, openNotes, type ScanReport } from '../../packages/core/report';
import { env, NET, NETWORK } from '../../packages/core/config';

const DATA = process.env.ZEROGAP_DATA_DIR ?? 'data';
const RESERVES_MS = Number(process.env.RESERVES_INTERVAL_MS ?? 60_000);
const SCAN_MS = Number(process.env.SCAN_INTERVAL_MS ?? 5 * 60_000);
const FLOWS_MS = Number(process.env.FLOWS_INTERVAL_MS ?? 30 * 60_000);
const SAFETY_MS = Number(process.env.SAFETY_INTERVAL_MS ?? 60_000);
const FLOW_DAYS = Number(process.env.FLOW_DAYS ?? 7);
const EVENT_LOOKBACK_BLOCKS = BigInt(process.env.EVENT_LOOKBACK_BLOCKS ?? 5000);

type Timed<T> = { value: T; ts: number; error?: string; errorAt?: number };
export type RatioPoint = { ts: number; reservesUsd: number; liabilitiesUsd: number; ratio?: number; status?: string };
export type FeedItem = { ts: number; kind: string; text: string; link?: string };

export type State = {
  startedAt: number;
  reserves?: Timed<ReserveSnapshot>;
  liabilities?: Timed<LiabilityScan & { components: LiabilityComponent[]; exposedUsd: number; pendingEstimateUsd: number }>;
  ratio?: Timed<{
    published: Assessment; reservesUsd: number; liabilitiesUsd: number;
    /** Σ depositors' vault shares vs the excluded vault accounts' own balances (should match). */
    vaultCrossCheck: { vaultAccountsUsd: number; depositorSharesUsd: number };
    openNotes: string[];
    confidence: string; failed: number; scanWindow: [number, number]; reservesTs: number;
    /** One price snapshot valued every reserve row of this scan (FR: same-instant pricing). */
    priceSnapshotAt?: number; inTransitNote: string;
  }>;
  safety?: Timed<EthSafetyState>;
  solanaSafety?: Timed<Awaited<ReturnType<typeof solanaSafetyFull>>>;
  solanaEvents?: SolanaInstructionEvent[];
  lastSolanaSignature?: string;
  events: SafetyEvent[];
  lastEventBlock?: number;
  flows?: Timed<{ rows: FlowCheckRow[]; coverage: FlowCoverage[]; moves: number }>;
  history: RatioPoint[];
  /** Metadata of the full verify-format report for the latest scan (the report itself is published as a file). */
  report?: { generatedAt: string; sha256: string; commit: string; file: string };
  feed: FeedItem[];
  alerts: (Alert & { ts: number; sent: boolean; error?: string })[];
  errors: Record<string, { at: number; message: string }>;
};

export class Engine {
  state: State = { startedAt: Date.now(), events: [], history: [], feed: [], alerts: [], errors: {} };
  private getPrice = createPricer();
  private store?: Store;
  private sent = new Set<string>();
  private running = new Set<string>();
  private flowsRaw: Flow[] = [];
  /** Full verify-format report of the latest scan (large: every account row). */
  lastReport?: ScanReport;

  async init() {
    await mkdir(DATA, { recursive: true });
    this.store = await openStore();
    try { Object.assign(this.state, JSON.parse(await readFile(`${DATA}/state.json`, 'utf8')), { startedAt: Date.now() }); } catch { /* first run */ }
    try { this.sent = new Set(JSON.parse(await readFile(`${DATA}/alerts-sent.json`, 'utf8'))); } catch { /* first run */ }
  }

  private async persist() {
    await writeFile(`${DATA}/state.json`, JSON.stringify(this.state));
    await writeFile(`${DATA}/alerts-sent.json`, JSON.stringify([...this.sent]));
  }

  private async guarded(name: string, fn: () => Promise<void>) {
    if (this.running.has(name)) return; // never overlap a slow job
    this.running.add(name);
    try { await fn(); delete this.state.errors[name]; }
    catch (e) { this.state.errors[name] = { at: Date.now(), message: (e as Error).message.split('\n')[0] }; console.error(`[${name}]`, (e as Error).message.split('\n')[0]); }
    finally { this.running.delete(name); await this.persist().catch(() => {}); }
  }

  private feed(item: FeedItem) {
    this.state.feed.unshift(item);
    this.state.feed = this.state.feed.slice(0, 100);
  }

  reservesJob = () => this.guarded('reserves', async () => {
    const s = await snapshotReserves(this.getPrice);
    if (s.failedChains.length) throw new Error(`collectors failed: ${s.failedChains.join(', ')}`);
    this.state.reserves = { value: s, ts: s.ts };
    await this.store?.insert('reserve_snapshots', toReserveRows(s.ts, s.rows));
  });

  scanJob = () => this.guarded('liabilities', async () => {
    const scan = await scanLiabilities();
    const b = liabilityBreakdown(scan);
    this.state.liabilities = { value: { ...scan, accounts: [], vaults: [], ...b }, ts: scan.ts }; // raw rows live in the report file
    // Reserves read right after the scan, valued with ONE price snapshot, so both sides are timestamped together.
    const snap = createSnapshotPricer();
    const r = await snapshotReserves(snap.getPrice);
    if (r.failedChains.length) throw new Error(`collectors failed: ${r.failedChains.join(', ')} — ratio not computed`);
    this.state.reserves = { value: r, ts: r.ts };
    await this.store?.insert('reserve_snapshots', toReserveRows(r.ts, r.rows));
    const common = { reservesUsd: r.pricedUsd, unpricedReserves: r.unpriced.length, pendingLiabilityEstimateUsd: b.pendingEstimateUsd };
    const published = assessRatio({ ...common, liabilitiesUsd: b.exposedUsd });
    const conf = confidence(scan.listed + scan.discovered, scan.read, Date.now() - scan.ts);
    this.state.ratio = { ts: Date.now(), value: { published, vaultCrossCheck: { vaultAccountsUsd: scan.vaultsUsd, depositorSharesUsd: scan.vaultSharesUsd }, openNotes: openNotes(scan, r), reservesUsd: r.pricedUsd, liabilitiesUsd: b.exposedUsd, confidence: conf.label, failed: conf.failed, scanWindow: [scan.startedAt, scan.ts], reservesTs: r.ts, priceSnapshotAt: snap.takenAt(), inTransitNote: IN_TRANSIT.note } };
    this.lastReport = buildReport({ liab: scan, reserves: r, priceSnapshotAt: snap.takenAt(), strikeApi: env.strikeApi });
    this.state.report = { generatedAt: this.lastReport.generated_at, sha256: this.lastReport.content_sha256, commit: this.lastReport.code_commit, file: reportFileName(this.lastReport) };
    this.state.history.push({ ts: Date.now(), reservesUsd: r.pricedUsd, liabilitiesUsd: b.exposedUsd, ratio: published.ratio, status: published.status });
    this.state.history = this.state.history.slice(-2000);
    this.feed({ ts: Date.now(), kind: published.status ?? 'Scan', text: `Scan complete · ${scan.read.toLocaleString('en-US')} accounts · ${scan.failed.length} failed · ${formatGap(published)}` });
    await this.store?.insert('liability_snapshots', [{
      ts: new Date(scan.ts).toISOString(), started_at: new Date(scan.startedAt).toISOString(), accounts_listed: scan.listed, vaults_excluded: scan.excludedVaults,
      subaccounts_discovered: scan.discovered, accounts_read: scan.read, failures: scan.failed.length, margin_usd: scan.totalUsd,
      staking_rewards_usd: scan.stakingRewardsUsd, locked_rewards_usd: scan.lockedRewardsUsd, pending_components: JSON.stringify(b.components.filter(c => c.status !== 'counted')),
      vaults_audit_usd: scan.vaultsUsd, total_usd: b.exposedUsd,
    }]);
    await this.store?.insert('ratio_snapshots', [{
      ts: new Date().toISOString(), reserves_usd: r.pricedUsd, liabilities_usd: b.exposedUsd, ratio: published.ratio ?? null, status: published.status ?? null,
      explained_by: published.explainedBy ?? null, confidence: conf.label, unpriced: JSON.stringify(r.unpriced.map(u => ({ chain: u.chain, asset: u.asset, amount: u.amount }))),
    }]);
    await this.alertJob();
  });

  safetyJob = () => this.guarded('safety', async () => {
    const [s, sol] = await Promise.all([ethSafetyState(), solanaSafetyFull().catch(e => {
      // The testnet devnet program is an older version without a VaultState account: not available, not an error.
      if (NETWORK === 'testnet' && /not found/.test((e as Error).message)) { delete this.state.errors.solanaSafety; return undefined; }
      this.state.errors.solanaSafety = { at: Date.now(), message: (e as Error).message }; return undefined;
    })]);
    this.state.safety = { value: s, ts: s.ts };
    if (sol) { this.state.solanaSafety = { value: sol, ts: Date.now() }; delete this.state.errors.solanaSafety; }
    // Solana program instructions (IDL-decoded) since the last seen signature.
    const solFirst = this.state.lastSolanaSignature === undefined;
    try {
      const { events, newest } = await solanaInstructionEvents(this.state.lastSolanaSignature, solFirst ? 10 : 25);
      this.state.lastSolanaSignature = newest;
      this.state.solanaEvents = [...events.reverse(), ...(this.state.solanaEvents ?? [])].slice(0, 200);
      for (const e of events) this.feed({ ts: e.ts, kind: `Solana · ${e.type}`, text: `Solana vault instruction ${e.type}`, link: `https://solscan.io/tx/${e.signature}${NET.explorers.solanaSuffix}` });
      delete this.state.errors.solanaEvents;
    } catch (e) { this.state.errors.solanaEvents = { at: Date.now(), message: (e as Error).message.split('\n')[0] }; }
    if (solFirst) for (const a of this.buildAlerts()) this.sent.add(`${a.rule}|${a.key}`);
    const head = BigInt(s.block);
    const first = this.state.lastEventBlock === undefined;
    const from = first ? head - EVENT_LOOKBACK_BLOCKS : BigInt(this.state.lastEventBlock! + 1);
    if (from > head) return;
    const evs = await ethSafetyEventsBetween(from, head);
    this.state.lastEventBlock = s.block;
    const known = new Set(this.state.events.map(e => `${e.tx}:${e.type}`));
    for (const e of evs) {
      if (known.has(`${e.tx}:${e.type}`)) continue;
      this.state.events.push(e);
      this.feed({ ts: e.ts, kind: e.type, text: describeEvent(e), link: `${NET.explorers.ethereum}/tx/${e.tx}` });
      await this.store?.insert('safety_events', [{ ts: new Date(e.ts).toISOString(), chain: e.chain, type: e.type, amount: e.args.amount ?? null, tx_hash: e.tx, status: 'seen' }]).catch(() => {});
    }
    this.state.events = this.state.events.slice(-500);
    // Events already on-chain when ZeroGap first starts are shown in the feed but not re-alerted.
    if (first) for (const a of this.buildAlerts()) this.sent.add(`${a.rule}|${a.key}`);
    await this.alertJob();
  });

  flowsJob = () => this.guarded('flows', async () => {
    const since = Date.now() - FLOW_DAYS * 86_400_000;
    const [reported, ...chains] = await Promise.all([
      reportedTransfers(),
      ...[ethFlows, solanaFlows, cardanoFlows].map(f => f(since, this.getPrice).catch(e => ({ error: (e as Error).message.split('\n')[0] }))),
    ]);
    const ok = chains.filter((c): c is { flows: Flow[]; coverage: FlowCoverage } => !('error' in c));
    const failed = chains.filter((c): c is { error: string } => 'error' in c);
    this.flowsRaw = ok.flatMap(c => c.flows);
    const coverage = relayedCoverage(ok.map(c => c.coverage));
    const rows = flowCheck(reported as any, bucketFlows(this.flowsRaw), coverage);
    this.state.flows = { value: { rows, coverage, moves: this.flowsRaw.length }, ts: Date.now() };
    for (const r of rows.filter(x => x.comparable)) {
      await this.store?.insert('flow_checks', [{ day: r.day, chain: r.chain, reported_in: r.reportedIn, onchain_in: r.onchainIn, reported_out: r.reportedOut, onchain_out: r.onchainOut, match_pct: Math.min(r.matchInPct, r.matchOutPct) }]).catch(() => {}); // PK (day, chain): first write wins
    }
    if (failed.length) throw new Error(failed.map(f => f.error).join('; '));
  });

  private buildAlerts(): Alert[] {
    const s = this.state;
    const open = openItems(s.events);
    const now = Date.now();
    // Outflow spike from decoded on-chain outflows (all chains with a price): last 1 h vs 7-day hourly average.
    // Only the window every chain's collector actually covered, so a short-coverage chain cannot fake a spike.
    const windowStart = Math.max(...(s.flows?.value.coverage ?? []).map(c => c.fromTs), now - 7 * 86_400_000);
    const outs = this.flowsRaw.filter(f => (f.usd ?? 0) < 0 && f.ts >= windowStart);
    const lastHour = outs.filter(f => f.ts > now - 3_600_000).reduce((x, f) => x - f.usd!, 0);
    const span = (now - windowStart) / 3_600_000;
    const enoughHistory = span >= 24; // need at least a day of covered history for a meaningful average
    const latestDay = s.flows?.value.rows.filter(r => r.comparable).map(r => r.day).sort().pop();
    return evaluate({
      assessment: s.ratio?.value.published ?? {},
      flowMismatches: (s.flows?.value.rows ?? []).filter(r => r.mismatch && r.day === latestDay),
      paused: [
        ...(s.safety ? [{ chain: 'ethereum', paused: s.safety.value.paused }] : []),
        ...(s.solanaSafety ? [{ chain: 'solana', paused: s.solanaSafety.value.paused || s.solanaSafety.value.recovered }] : []),
      ],
      queued: [
        ...open.queued.map(e => ({ id: e.args.requestID, amount: Number(e.args.amount) / 1e6, token: 'USDC', executableAt: Number(e.args.executableAt) * 1000, tx: e.tx })),
        ...(s.solanaSafety?.value.pending.withdrawals ?? []).map(w => ({ id: w.requestId, amount: w.amount / (w.asset.kind === 'Sol' ? 1e9 : 1e6), token: w.asset.kind === 'Sol' ? 'SOL' : 'USDC', executableAt: w.executableAt * 1000, tx: w.address })),
      ],
      actions: [
        ...open.actions.map(e => ({ id: e.args.actionId, kind: e.args.kind, tx: e.tx })),
        ...(s.solanaSafety?.value.pending.actions ?? []).map(a => ({ id: a.requestId, kind: `Solana ${a.kind}`, tx: a.address })),
      ],
      controlEvents: s.events.filter(e => !['Withdraw', 'Deposit', 'LargeWithdrawalQueued', 'LargeWithdrawalExecuted', 'LargeWithdrawalCancelled', 'ActionProposed', 'ActionFinalized', 'ActionCancelled', 'Paused', 'Unpaused'].includes(e.type))
        .map(e => ({ type: e.type, tx: e.tx, detail: describeEvent(e) }))
        .concat((s.solanaEvents ?? []).filter(e => !SOLANA_ROUTINE.has(e.type)).map(e => ({ type: `Solana ${e.type}`, tx: e.signature, detail: `Solana vault instruction ${e.type} (slot ${e.slot})` }))),
      outflow1hUsd: lastHour, avgHourlyOutflowUsd: enoughHistory ? outs.reduce((x, f) => x - f.usd!, 0) / span : 0, hourBucket: Math.floor(now / 3_600_000),
    });
  }

  alertJob = async () => {
    // Only the published mainnet result alerts the public channel; the testnet deployment records alerts on its dashboard.
    const tg = NETWORK === 'mainnet' ? telegramFromEnv() : undefined;
    // Alerts recorded while Telegram was not configured are delivered once it is (oldest first).
    if (tg) for (const rec of [...this.state.alerts].reverse().filter(x => !x.sent && x.error?.startsWith('not sent'))) {
      try { await sendTelegram(tg, formatAlert(rec, new Date(rec.ts), tg.dashboardUrl)); rec.sent = true; delete rec.error; }
      catch (e) { rec.error = `not sent: ${(e as Error).message}`; }
    }
    for (const a of dedupe(this.buildAlerts(), this.sent)) {
      const rec: State['alerts'][number] = { ...a, ts: Date.now(), sent: false };
      if (tg) {
        try { await sendTelegram(tg, formatAlert(a, new Date(), tg.dashboardUrl)); rec.sent = true; }
        catch (e) { rec.error = `not sent: ${(e as Error).message}`; } // kept as one record; re-sent by the held-back loop next cycle
      } else rec.error = NETWORK === 'mainnet' ? 'not sent: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set' : 'testnet: shown on the dashboard only'; // recorded once, shown on the dashboard
      if (rec.error && this.state.alerts.some(x => x.rule === a.rule && x.key === a.key)) continue;
      this.state.alerts.unshift(rec);
      this.feed({ ts: rec.ts, kind: `Alert · ${a.severity}`, text: `${a.title} — ${a.lines.join(' · ')}`, link: a.link });
      await this.store?.insert('alerts', [{ ts: new Date(rec.ts).toISOString(), rule: a.rule, severity: a.severity, message: [a.title, ...a.lines].join(' | '), key: a.key, sent: rec.sent, simulated: false }]).catch(() => {});
    }
    this.state.alerts = this.state.alerts.slice(0, 200);
  };

  start() {
    const every = (ms: number, job: () => Promise<void>) => { void job(); return setInterval(job, ms); };
    every(RESERVES_MS, this.reservesJob);
    every(SAFETY_MS, this.safetyJob);
    every(SCAN_MS, this.scanJob);
    every(FLOWS_MS, this.flowsJob);
  }
}

/** Routine Solana vault instructions: shown in the feed, not alerted on their own (queues are alerted via PendingWithdrawal). */
const SOLANA_ROUTINE = new Set(['deposit', 'withdraw', 'bulk_withdraw', 'execute_large_withdrawal']);

export function describeEvent(e: SafetyEvent): string {
  const usdc = (v?: string) => (v ? `${(Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC` : '');
  switch (e.type) {
    case 'Withdraw': return `Ethereum vault · ${usdc(e.args.amount)} withdrawn`;
    case 'Deposit': return `Ethereum vault · ${usdc(e.args.amount)} deposited`;
    case 'LargeWithdrawalQueued': return `Large withdrawal queued · ${usdc(e.args.amount)}`;
    case 'Upgraded': return `Implementation upgraded to ${e.args.implementation}`;
    default: return `${e.type} ${Object.entries(e.args).map(([k, v]) => `${k}=${v.length > 20 ? v.slice(0, 10) + '…' : v}`).join(' ')}`;
  }
}

export async function ethHeadBlock() { return Number(await client().getBlockNumber()); }
