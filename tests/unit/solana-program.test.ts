import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import stateFixture from '../fixtures/solana-vault-state.json';
import txs from '../fixtures/solana-program-txs.json';
import {
  ACCOUNT_DISCRIMINATOR, decodeVaultStateFull, decodePendingWithdrawal, decodePendingAction, programInstructions, WATCHED_INSTRUCTIONS,
} from '../../packages/collectors/solana-program';

/** Minimal Borsh writer for building account bytes exactly as the IDL lays them out. */
class W {
  parts: Buffer[] = [];
  raw(b: Buffer) { this.parts.push(b); return this; }
  u8(v: number) { return this.raw(Buffer.from([v])); }
  u64(v: number | bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return this.raw(b); }
  i64(v: number) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return this.raw(b); }
  key(k: string) { return this.raw(new PublicKey(k).toBuffer()); }
  done() { return Buffer.concat(this.parts); }
}
const UUID = '0123456789abcdef0123456789abcdef';
const RECIPIENT = 'BT85fgyhyZhCtaNdciKEGoj7mU8E3EeFijPy6XCmCAA6';
const PAYER = 'Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('VaultState (recorded mainnet account)', () => {
  const s = decodeVaultStateFull(Buffer.from(stateFixture.data, 'base64'));
  it('decodes the head fields', () => {
    expect(s).toMatchObject({ recovered: false, pendingWithdrawalCount: expect.any(Number), paused: expect.any(Boolean) });
  });
  it('decodes all 20 per-asset usage windows, admin-withdrawal count and the optional last audit', () => {
    expect(s.assetUsage).toHaveLength(20);
    expect(s.adminWithdrawalCount).toBe(0);
    expect(s.lastAdminWithdrawal).toBeNull();
  });
});

describe('PendingWithdrawal / PendingAction (IDL layout)', () => {
  it('decodes a queued SPL withdrawal', () => {
    const data = new W().raw(ACCOUNT_DISCRIMINATOR.PendingWithdrawal).raw(Buffer.from(UUID, 'hex')).key(RECIPIENT).u8(0)
      .u8(1).key(USDC).u64(500_000_000_000).i64(1_792_600_000).i64(1_792_686_400).i64(1_792_772_800).u64(0).key(PAYER).u8(254).done();
    expect(decodePendingWithdrawal(data)).toEqual({
      requestId: '01234567-89ab-cdef-0123-456789abcdef', recipient: RECIPIENT, assetIx: 0, asset: { kind: 'SplToken', mint: USDC },
      amount: 500_000_000_000, queuedAt: 1_792_600_000, executableAt: 1_792_686_400, expiresAt: 1_792_772_800, signerEpoch: 0, rentPayer: PAYER,
    });
  });
  it('decodes a queued SOL withdrawal (enum without payload)', () => {
    const data = new W().raw(ACCOUNT_DISCRIMINATOR.PendingWithdrawal).raw(Buffer.from(UUID, 'hex')).key(RECIPIENT).u8(1)
      .u8(0).u64(2_000_000_000).i64(1).i64(2).i64(3).u64(7).key(PAYER).u8(1).done();
    expect(decodePendingWithdrawal(data)).toMatchObject({ asset: { kind: 'Sol' }, amount: 2_000_000_000, signerEpoch: 7 });
  });
  it('decodes a timelocked action with its ActionKind name', () => {
    const data = new W().raw(ACCOUNT_DISCRIMINATOR.PendingAction).raw(Buffer.from(UUID, 'hex')).u8(4).raw(Buffer.alloc(32, 0xab))
      .i64(100).i64(86_500).i64(691_300).key(PAYER).u8(1).done();
    expect(decodePendingAction(data)).toMatchObject({ kind: 'RaiseLimits', proposedAt: 100, readyAt: 86_500, payloadHash: 'ab'.repeat(32) });
  });
  it('rejects the wrong account type', () => {
    expect(() => decodePendingAction(Buffer.from(stateFixture.data, 'base64'))).toThrow(/not a PendingAction/);
  });
});

describe('program instructions (recorded mainnet transactions)', () => {
  const asTx = (t: { staticAccountKeys: string[]; compiledInstructions: { programIdIndex: number; data: string }[] }) => ({
    transaction: { message: {
      staticAccountKeys: t.staticAccountKeys.map(k => new PublicKey(k)),
      compiledInstructions: t.compiledInstructions.map(ix => ({ programIdIndex: ix.programIdIndex, data: Buffer.from(ix.data, 'base64') })),
    } },
  });
  it('names deposit and bulk_withdraw by IDL discriminator', () => {
    expect(programInstructions(asTx(txs.deposit))).toContain('deposit');
    expect(programInstructions(asTx(txs.bulk_withdraw))).toContain('bulk_withdraw');
  });
  it('watches every safety-relevant instruction named by the founder', () => {
    for (const n of ['withdraw', 'bulk_withdraw', 'execute_large_withdrawal', 'cancel_withdrawal', 'guardian_pause', 'governance_unpause',
      'propose_action', 'finalize_action', 'cancel_action', 'admin_withdraw', 'update_config', 'inactivity_recover']) expect(WATCHED_INSTRUCTIONS.has(n)).toBe(true);
  });
});
