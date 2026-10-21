import { describe, it, expect } from 'vitest';
import { reserveRatio, confidence, usdValue, flowMatch } from '../../packages/core/ratio';
import { evaluate, dedupe } from '../../packages/alerts/rules';
import { createRateLimiter } from '../../packages/core/rateLimiter';

describe('ratio (T2.1, T2.2)', () => {
  it('computes', () => expect(reserveRatio(1010, 1000)).toBeCloseTo(1.01));
  it('no Infinity on zero liabilities', () => expect(reserveRatio(5, 0)).toBeUndefined());
  it('labels', () => {
    expect(confidence(10, 10, 1000).label).toBe('Exact');
    expect(confidence(10, 8, 1000)).toEqual({ label: 'Partial', failed: 2 });
    expect(confidence(10, 10, 11 * 60_000).label).toBe('Stale');
  });
});

describe('valuation and flow (T1.2, T2.7)', () => {
  it('usd', () => expect(usdValue(2.5, 0.3456)).toBe(0.86));
  it('flow ok', () => expect(flowMatch(1000, 1000).mismatch).toBe(false));
  it('flow mismatch', () => expect(flowMatch(1000, 980).mismatch).toBe(true));
});

describe('alerts (T4.2–T4.4)', () => {
  const clean = { ratio: 1.02, flowMismatch: [], paused: false, queued: [], actions: [], outflow1hUsd: 10, avgHourlyOutflowUsd: 10 };
  it('silent when clean', () => expect(evaluate(clean)).toHaveLength(0));
  it('fires on pause, tagged in sim', () => {
    const a = evaluate({ ...clean, paused: true, simulated: true });
    expect(a[0].message.startsWith('[SIMULATION]')).toBe(true);
  });
  it('dedupes', () => {
    const s = new Set<string>(); const a = evaluate({ ...clean, paused: true });
    expect(dedupe(a, s)).toHaveLength(1); expect(dedupe(a, s)).toHaveLength(0);
  });
});

describe('rate limiter (T2.5)', () => {
  it('never more than rps per second', async () => {
    let t = 0; const starts: number[] = [];
    const take = createRateLimiter(40, () => t, async ms => { t += ms; });
    for (let i = 0; i < 100; i++) { await take(); starts.push(t); }
    for (const s of starts) expect(starts.filter(x => x >= s && x < s + 1000).length).toBeLessThanOrEqual(40);
  });
});
