import { describe, it, expect } from 'vitest';
import transfers from '../fixtures/transfers.json';
import { parseTransfers } from '../../packages/collectors/stats';
import { bucketFlows } from '../../packages/collectors/flows';
import { flowCheck } from '../../packages/core/flowCheck';
import { flowMatch } from '../../packages/core/ratio';

describe('P2 flow match', () => {
  it('T2.7 flow match: equal = 100%; 2% gap → mismatch', () => {
    expect(flowMatch(1000, 1000)).toEqual({ matchPct: 100, mismatch: false });
    expect(flowMatch(1000, 980).mismatch).toBe(true);
    expect(flowMatch(1000, 995).mismatch).toBe(false);
  });

  it('parses the recorded /dashboard/transfers response per day per chain', () => {
    const rows = parseTransfers(transfers as { deposits: [number, string, number][]; withdrawals: [number, string, number][] });
    const eth = rows.filter(r => r.chain === 'ethereum');
    expect(eth.length).toBeGreaterThan(0);
    expect(rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.day))).toBe(true);
    const totalIn = (transfers.deposits as [number, string, number][]).reduce((s, r) => s + Number(r[2]), 0);
    expect(rows.reduce((s, r) => s + r.in, 0)).toBeCloseTo(totalIn, 6);
  });

  it('buckets on-chain moves by UTC day; unpriced moves counted, not valued', () => {
    const d = Date.parse('2026-10-20T05:00:00Z');
    const days = bucketFlows([
      { chain: 'cardano', ts: d, tx: 'a', asset: 'USDM', amount: 100, usd: 100 },
      { chain: 'cardano', ts: d + 3600_000, tx: 'b', asset: 'USDM', amount: -40, usd: -40 },
      { chain: 'cardano', ts: d, tx: 'c', asset: 'sUSDr', amount: 5 },
    ]);
    expect(days).toEqual([{ day: '2026-10-20', chain: 'cardano', in: 100, out: 40, unpricedMoves: 1 }]);
  });

  it('only full days inside coverage are compared; mismatch flagged beyond 1%', () => {
    const cov = [{ chain: 'ethereum', fromTs: Date.parse('2026-10-20T00:00:00Z'), toTs: Date.parse('2026-10-21T12:00:00Z') }];
    const rows = flowCheck(
      [{ day: '2026-10-19', chain: 'ethereum', in: 5, out: 0 }, { day: '2026-10-20', chain: 'ethereum', in: 1000, out: 500 }, { day: '2026-10-21', chain: 'ethereum', in: 10, out: 0 }],
      [{ day: '2026-10-20', chain: 'ethereum', in: 1000, out: 470, unpricedMoves: 0 }, { day: '2026-10-21', chain: 'ethereum', in: 3, out: 0, unpricedMoves: 0 }],
      cov,
    );
    expect(rows.map(r => [r.day, r.comparable, r.mismatch])).toEqual([['2026-10-20', true, true], ['2026-10-21', false, false]]);
    expect(rows[0].matchOutPct).toBe(94);
  });
});
