import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/solana-vault-state.json';
import { decodeVaultState, statePda, treasuryPda } from '../../packages/collectors/solana';

describe('Solana VaultState (corrected IDL, recorded mainnet account)', () => {
  it('derives the state and treasury PDAs of the live vault', () => {
    expect(statePda().toBase58()).toBe(fixture.address);
    expect(treasuryPda().toBase58()).toBe('H4nZyX3qGQwGH6wQn8G53uZ6LX8TqPZDakCN2M54icSH');
  });
  it('decodes pause flag, queue count and rate-limit windows', () => {
    const s = decodeVaultState(Buffer.from(fixture.data, 'base64'));
    expect(typeof s.paused).toBe('boolean');
    expect(s.recovered).toBe(false);
    expect(s.pendingWithdrawalCount).toBeGreaterThanOrEqual(0);
    expect(s.globalUsage24h.windowStart % 3600).toBe(0); // windows start on the hour
    expect(s.globalUsage1h.current).toBeLessThanOrEqual(s.globalUsage24h.current + s.globalUsage24h.previous);
  });
  it('rejects accounts that are not VaultState', () => {
    expect(() => decodeVaultState(Buffer.alloc(200))).toThrow(/not a VaultState/);
  });
});
