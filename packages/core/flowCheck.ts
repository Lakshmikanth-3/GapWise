import { flowMatch } from './flowMatch';

export type FlowCheckRow = {
  day: string; chain: string;
  reportedIn: number; onchainIn: number; reportedOut: number; onchainOut: number;
  matchInPct: number; matchOutPct: number; mismatch: boolean;
  /** false when the day is outside what the on-chain collector could see — never compared. */
  comparable: boolean; unpricedMoves: number; note?: string;
};

const dayStart = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Joins Strike-reported daily flows with on-chain locker flows per chain per day (FR-2.4).
 * Only full UTC days inside the collector's coverage window are compared.
 */
export function flowCheck(
  reported: { day: string; chain: string; in: number; out: number }[],
  onchain: { day: string; chain: string; in: number; out: number; unpricedMoves: number }[],
  coverage: { chain: string; fromTs: number; toTs: number; note?: string }[],
  tolerance = 0.01,
): FlowCheckRow[] {
  const rows: FlowCheckRow[] = [];
  for (const cov of coverage) {
    const days = new Set<string>();
    for (const r of [...reported, ...onchain]) if (r.chain === cov.chain) days.add(r.day);
    for (const day of [...days].sort()) {
      const s = dayStart(day);
      const comparable = s >= cov.fromTs && s + 86_400_000 <= cov.toTs;
      if (!comparable && s + 86_400_000 <= cov.fromTs) continue; // entirely before coverage: skip
      const rep = reported.find(r => r.chain === cov.chain && r.day === day) ?? { in: 0, out: 0 };
      const onc = onchain.find(r => r.chain === cov.chain && r.day === day) ?? { in: 0, out: 0, unpricedMoves: 0 };
      const mi = flowMatch(rep.in, onc.in, tolerance);
      const mo = flowMatch(rep.out, onc.out, tolerance);
      rows.push({
        day, chain: cov.chain, reportedIn: rep.in, onchainIn: onc.in, reportedOut: rep.out, onchainOut: onc.out,
        matchInPct: mi.matchPct, matchOutPct: mo.matchPct, mismatch: comparable && (mi.mismatch || mo.mismatch),
        comparable, unpricedMoves: onc.unpricedMoves,
        note: comparable ? cov.note : 'partial day (outside on-chain coverage)',
      });
    }
  }
  return rows;
}
