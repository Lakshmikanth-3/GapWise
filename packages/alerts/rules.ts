export type Alert = { rule: string; severity: 'info' | 'warn' | 'critical'; message: string; key: string; simulated: boolean };

export function evaluate(s: {
  ratio?: number; flowMismatch: { chain: string; pct: number }[]; paused: boolean;
  queued: { id: string; amountUsd: number }[]; actions: { id: string; kind: string }[];
  outflow1hUsd: number; avgHourlyOutflowUsd: number; simulated?: boolean;
}): Alert[] {
  const sim = !!s.simulated; const tag = sim ? '[SIMULATION] ' : '';
  const a: Alert[] = [];
  if (s.ratio !== undefined && s.ratio < 1) a.push({ rule: 'ratio_below_100', severity: 'critical', message: `${tag}Reserve ratio ${(s.ratio * 100).toFixed(2)}%`, key: 'ratio', simulated: sim });
  for (const f of s.flowMismatch) a.push({ rule: 'flow_mismatch', severity: 'warn', message: `${tag}${f.chain} flow match ${f.pct}%`, key: `flow:${f.chain}`, simulated: sim });
  if (s.paused) a.push({ rule: 'paused', severity: 'critical', message: `${tag}Vault paused`, key: 'paused', simulated: sim });
  for (const q of s.queued) a.push({ rule: 'large_withdrawal_queued', severity: 'warn', message: `${tag}Large withdrawal queued: $${q.amountUsd.toLocaleString()}`, key: `queued:${q.id}`, simulated: sim });
  for (const x of s.actions) a.push({ rule: 'timelock_action', severity: 'warn', message: `${tag}Timelocked change proposed: ${x.kind}`, key: `action:${x.id}`, simulated: sim });
  if (s.avgHourlyOutflowUsd > 0 && s.outflow1hUsd > 3 * s.avgHourlyOutflowUsd) a.push({ rule: 'outflow_spike', severity: 'warn', message: `${tag}1h outflow $${s.outflow1hUsd.toLocaleString()} is >3x average`, key: `spike:${Math.floor(Date.now() / 3_600_000)}`, simulated: sim });
  return a;
}

export function dedupe(alerts: Alert[], sent: Set<string>): Alert[] {
  return alerts.filter(x => { const k = `${x.rule}|${x.key}|${x.simulated}`; if (sent.has(k)) return false; sent.add(k); return true; });
}
