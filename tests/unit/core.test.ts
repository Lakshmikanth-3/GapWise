import { describe, it, expect } from 'vitest';
import { reserveRatio, confidence, usdValue, flowMatch } from '../../packages/core/ratio';
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

describe('rate limiter (T2.5)', () => {
  it('never more than rps per second', async () => {
    let t = 0; const starts: number[] = [];
    const take = createRateLimiter(40, () => t, async ms => { t += ms; });
    for (let i = 0; i < 100; i++) { await take(); starts.push(t); }
    for (const s of starts) expect(starts.filter(x => x >= s && x < s + 1000).length).toBeLessThanOrEqual(40);
  });
  it('1,000 calls take at least 24 s of limiter time at 40 rps', async () => {
    let t = 0;
    const take = createRateLimiter(40, () => t, async ms => { t += ms; });
    for (let i = 0; i < 1000; i++) await take();
    expect(t).toBeGreaterThanOrEqual(24_000);
  });
});
