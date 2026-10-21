import { describe, it, expect } from 'vitest';
import { scanLiabilities } from '../../packages/collectors/accounts';
import { reportedTransfers } from '../../packages/collectors/stats';

describe('P2 live', () => {
  it('T2.8 full scan: 100% coverage in under 5 minutes', async () => {
    const t0 = Date.now();
    const s = await scanLiabilities();
    expect(s.failed).toEqual([]);
    expect(s.read).toBe(s.listed + s.discovered);
    expect(Date.now() - t0).toBeLessThan(5 * 60_000);
  }, 6 * 60_000);

  it('Strike transfers endpoint returns per-chain daily series for all three locker chains', async () => {
    const rows = await reportedTransfers();
    for (const c of ['ethereum', 'solana', 'cardano']) expect(rows.some(r => r.chain === c)).toBe(true);
  });
});
