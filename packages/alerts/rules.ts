// Alert rules (FR-3.3). Real events only — there is no simulation mode (owner's decision, see DECISIONS #30).
import type { Assessment } from '../core/ratio';

export type Severity = 'info' | 'warn' | 'critical';
export type Alert = { rule: string; severity: Severity; title: string; lines: string[]; key: string; link?: string };

export type AlertInput = {
  assessment: Assessment;
  flowMismatches: { day: string; chain: string; matchInPct: number; matchOutPct: number }[];
  paused: { chain: string; paused: boolean }[];
  queued: { id: string; amount: number; token: string; executableAt?: number; tx: string }[];
  actions: { id: string; kind: string; tx: string }[];
  /** Other decoded control events (Upgraded, RoleMembersUpdated, RateLimitUpdated, AdminWithdraw*). */
  controlEvents: { type: string; tx: string; detail: string }[];
  outflow1hUsd: number; avgHourlyOutflowUsd: number; hourBucket: number;
};

const etherscanTx = (tx: string) => `https://etherscan.io/tx/${tx}`;

export function evaluate(s: AlertInput): Alert[] {
  const a: Alert[] = [];
  const r = s.assessment;
  // A ratio outside the band is published only as Drift (warn). "Needs review" is logged for investigation, never
  // sent as an insolvency alert; "Incomplete" (explained by pending components) is not alerted.
  if (r.status === 'Drift' && r.ratio !== undefined) {
    a.push({ rule: 'ratio_drift', severity: 'warn', title: 'Reserve ratio drift', lines: [`Ratio ${(r.ratio * 100).toFixed(4)}% (target 100.00%)`], key: `drift:${Math.round(r.ratio * 1e4)}` });
  }
  for (const f of s.flowMismatches) a.push({ rule: 'flow_mismatch', severity: 'warn', title: `Flow mismatch · ${f.chain}`, lines: [`${f.day}: deposits ${f.matchInPct}% · withdrawals ${f.matchOutPct}% match`], key: `flow:${f.chain}:${f.day}` });
  for (const p of s.paused) if (p.paused) a.push({ rule: 'paused', severity: 'critical', title: `Vault paused · ${p.chain}`, lines: ['Withdrawals are halted until governance unpauses'], key: `paused:${p.chain}` });
  for (const q of s.queued) a.push({ rule: 'large_withdrawal_queued', severity: 'warn', title: 'Large withdrawal queued', lines: [`Ethereum vault · ${q.amount.toLocaleString('en-US')} ${q.token}`, ...(q.executableAt ? [`Executable ${new Date(q.executableAt).toISOString()}`] : [])], key: `queued:${q.id}`, link: etherscanTx(q.tx) });
  for (const x of s.actions) a.push({ rule: 'timelock_action', severity: 'warn', title: 'Timelocked change proposed', lines: [`Kind: ${x.kind}`], key: `action:${x.id}`, link: etherscanTx(x.tx) });
  for (const e of s.controlEvents) a.push({ rule: 'control_event', severity: e.type === 'Upgraded' || e.type.startsWith('AdminWithdraw') ? 'critical' : 'warn', title: e.type, lines: [e.detail], key: `event:${e.tx}:${e.type}`, link: etherscanTx(e.tx) });
  if (s.avgHourlyOutflowUsd > 0 && s.outflow1hUsd > 3 * s.avgHourlyOutflowUsd) {
    a.push({ rule: 'outflow_spike', severity: 'warn', title: 'Unusual outflow', lines: [`Last 1h $${Math.round(s.outflow1hUsd).toLocaleString('en-US')} vs 7-day hourly avg $${Math.round(s.avgHourlyOutflowUsd).toLocaleString('en-US')} (>3×)`], key: `spike:${s.hourBucket}` });
  }
  return a;
}

/** Same rule + same key = one alert, ever (persisted set). */
export function dedupe(alerts: Alert[], sent: Set<string>): Alert[] {
  return alerts.filter(x => { const k = `${x.rule}|${x.key}`; if (sent.has(k)) return false; sent.add(k); return true; });
}
