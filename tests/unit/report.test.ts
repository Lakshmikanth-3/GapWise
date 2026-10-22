import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildReport, reportFileName, RULES } from '../../packages/core/report';
import type { LiabilityScan } from '../../packages/collectors/accounts';
import type { ReserveSnapshot } from '../../packages/collectors/reserves';

const liab: LiabilityScan = {
  accounts: [
    { account_id: 'a1', sub_account: false, margin_balance: '100.5', lockedRewards: '0.5', stakingRewardBalance: '3' },
    { account_id: 's1', sub_account: true, margin_balance: '-2', lockedRewards: '0', stakingRewardBalance: '0' },
  ],
  vaults: [{ vault_id: 'v-uuid', margin_balance: '50' }],
  listed: 1, excludedVaults: 1, vaultsUsd: 50, discovered: 1, read: 2, failed: [], totalUsd: 98.5,
  stakingRewardsUsd: 3, lockedRewardsUsd: 0.5, lockedInWallet: { consistent: 1, inconsistent: 0 }, negative: ['s1'], startedAt: 1_000, ts: 2_000,
};
const reserves = {
  ts: 3_000, failedChains: [], custodyScale: { applied: true }, stalePrices: false, pricedUsd: 98,
  rows: [{ chain: 'ethereum', asset: 'USDC', amount: 98, raw: '98000000', decimals: 6, contract: '0xA0b8', holder: '0xbF4c', usdValue: 98, quote: { usd: 1, status: 'priced', source: 'peg', ts: 1 } }],
  unpriced: [],
} as unknown as ReserveSnapshot;

describe('verify report (founder request: independently verifiable)', () => {
  const r = buildReport({ liab, reserves, priceSnapshotAt: 2_500, strikeApi: 'https://api.strikefinance.org', commit: 'abc1234' });

  it('carries every input: addresses, raw balances, prices, account rows, vault audit rows, timing and rules', () => {
    expect(r.reserves.rows[0]).toMatchObject({ address: '0xbF4c', raw: '98000000', decimals: 6, price_usd: 1, price_source: 'peg' });
    expect(r.liabilities.accounts).toHaveLength(2);
    expect(r.liabilities.vaults).toEqual([{ vault_id: 'v-uuid', margin_balance: '50' }]);
    expect(r.timing.price_snapshot_at).toBe(new Date(2_500).toISOString());
    expect(r.rules).toEqual(RULES);
    expect(r.code_commit).toBe('abc1234');
    expect(r.product).toMatch(/not affiliated with Strike Finance/);
  });

  it('recomputes liabilities and the ratio from the rows it publishes', () => {
    const fromRows = r.liabilities.accounts.reduce((s, a) => s + Number(a.margin_balance) - Number(a.lockedRewards), 0);
    expect(fromRows).toBeCloseTo(r.liabilities.total_usd, 9);
    expect(r.result.ratio).toBeCloseTo(98 / 98, 9);
    expect(r.result.gap_text).toBe('Gap +$0 · +0.0000%');
  });

  it('content_sha256 is the hash of the report body, so anyone can check integrity', () => {
    const { content_sha256, ...body } = r;
    expect(createHash('sha256').update(JSON.stringify(body)).digest('hex')).toBe(content_sha256);
  });

  it('never contains secrets (no RPC keys, tokens or env values)', () => {
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/api-key=|alchemy\.com\/v2\/[A-Za-z0-9]{8,}|TELEGRAM|\d{9,10}:AA/);
  });

  it('names files by network and timestamp', () => {
    expect(reportFileName({ generated_at: '2026-10-22T14:00:00.000Z', network: 'mainnet' })).toBe('mainnet-2026-10-22T14-00-00-000Z.json');
  });
});
