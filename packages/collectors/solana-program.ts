// Decoders for Strike's Solana vault program (IDL "strike_vault", program 7XASQ24f…, confirmed by the founder 22 Oct).
// Borsh layouts follow packages/collectors/abi/solana-vault.idl.json; integers are little-endian.
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import idl from './abi/solana-vault.idl.json' with { type: 'json' };
import { solConnection } from './solana';
import { LOCKERS } from '../core/config';

const disc = (name: string, list: { name: string; discriminator: number[] }[]) =>
  Buffer.from(list.find(x => x.name === name)!.discriminator);
export const ACCOUNT_DISCRIMINATOR = {
  VaultState: disc('VaultState', idl.accounts), PendingWithdrawal: disc('PendingWithdrawal', idl.accounts), PendingAction: disc('PendingAction', idl.accounts),
};
/** Instruction discriminator (hex) → IDL instruction name. */
export const INSTRUCTION_BY_DISCRIMINATOR = new Map(idl.instructions.map(i => [Buffer.from(i.discriminator).toString('hex'), i.name]));
const ACTION_KINDS = (idl.types.find(t => t.name === 'ActionKind')!.type as { variants: { name: string }[] }).variants.map(v => v.name);

class Reader {
  o = 8; // skip the 8-byte account discriminator
  constructor(readonly b: Buffer) {}
  u8() { return this.b.readUInt8(this.o++); }
  bool() { return this.u8() === 1; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return Number(v); }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return Number(v); }
  bytes(n: number) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return Buffer.from(v); }
  pubkey() { return new PublicKey(this.bytes(32)).toBase58(); }
  uuid() { const h = this.bytes(16).toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
  window() { return { windowStart: this.i64(), current: this.u64(), previous: this.u64() }; }
  asset() { return this.u8() === 0 ? { kind: 'Sol' as const } : { kind: 'SplToken' as const, mint: this.pubkey() }; }
}

const expectDisc = (b: Buffer, name: keyof typeof ACCOUNT_DISCRIMINATOR) => {
  if (!b.subarray(0, 8).equals(ACCOUNT_DISCRIMINATOR[name])) throw new Error(`not a ${name} account`);
};

export type WindowUsage = { windowStart: number; current: number; previous: number };
export type VaultStateFull = {
  paused: boolean; pauseEpoch: number; withdrawSignerEpoch: number; lastActivityAt: number;
  pendingWithdrawalCount: number; recovered: boolean; globalUsage1h: WindowUsage; globalUsage24h: WindowUsage;
  assetUsage: { usage1h: WindowUsage; usage24h: WindowUsage }[];
  adminWithdrawalCount: number;
  lastAdminWithdrawal: null | { auditId: string; timestamp: number; assetIx: number; amount: number; recipient: string; reasonHash: string };
};

export function decodeVaultStateFull(data: Buffer): VaultStateFull {
  expectDisc(data, 'VaultState');
  const r = new Reader(data);
  const head = {
    paused: r.bool(), pauseEpoch: r.u64(), withdrawSignerEpoch: r.u64(), lastActivityAt: r.i64(),
    pendingWithdrawalCount: r.u16(), recovered: r.bool(), globalUsage1h: r.window(), globalUsage24h: r.window(),
  };
  const assetUsage = Array.from({ length: 20 }, () => ({ usage1h: r.window(), usage24h: r.window() }));
  const adminWithdrawalCount = r.u32();
  const lastAdminWithdrawal = r.u8() === 1
    ? { auditId: r.uuid(), timestamp: r.i64(), assetIx: r.u8(), amount: r.u64(), recipient: r.pubkey(), reasonHash: r.bytes(32).toString('hex') }
    : null;
  return { ...head, assetUsage, adminWithdrawalCount, lastAdminWithdrawal };
}

export type PendingWithdrawal = {
  requestId: string; recipient: string; assetIx: number; asset: { kind: 'Sol' } | { kind: 'SplToken'; mint: string };
  amount: number; queuedAt: number; executableAt: number; expiresAt: number; signerEpoch: number; rentPayer: string;
};
export function decodePendingWithdrawal(data: Buffer): PendingWithdrawal {
  expectDisc(data, 'PendingWithdrawal');
  const r = new Reader(data);
  return { requestId: r.uuid(), recipient: r.pubkey(), assetIx: r.u8(), asset: r.asset(), amount: r.u64(), queuedAt: r.i64(), executableAt: r.i64(), expiresAt: r.i64(), signerEpoch: r.u64(), rentPayer: r.pubkey() };
}

export type PendingAction = { requestId: string; kind: string; payloadHash: string; proposedAt: number; readyAt: number; expiresAt: number; rentPayer: string };
export function decodePendingAction(data: Buffer): PendingAction {
  expectDisc(data, 'PendingAction');
  const r = new Reader(data);
  return { requestId: r.uuid(), kind: ACTION_KINDS[r.u8()] ?? 'Unknown', payloadHash: r.bytes(32).toString('hex'), proposedAt: r.i64(), readyAt: r.i64(), expiresAt: r.i64(), rentPayer: r.pubkey() };
}

/** All open PendingWithdrawal / PendingAction accounts of the program (queued large withdrawals, timelocked changes). */
export async function solanaPendingItems() {
  const conn = solConnection();
  const program = new PublicKey(LOCKERS.solanaProgram);
  const byKind = async (name: 'PendingWithdrawal' | 'PendingAction') =>
    conn.getProgramAccounts(program, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(ACCOUNT_DISCRIMINATOR[name]) } }] });
  const [w, a] = await Promise.all([byKind('PendingWithdrawal'), byKind('PendingAction')]);
  return {
    withdrawals: w.map(x => ({ address: x.pubkey.toBase58(), ...decodePendingWithdrawal(Buffer.from(x.account.data)) })),
    actions: a.map(x => ({ address: x.pubkey.toBase58(), ...decodePendingAction(Buffer.from(x.account.data)) })),
  };
}

/** Instructions the safety monitor watches (FR-3.1). Deposits are feed-only. */
export const WATCHED_INSTRUCTIONS = new Set([
  'withdraw', 'bulk_withdraw', 'execute_large_withdrawal', 'cancel_withdrawal', 'guardian_pause', 'governance_unpause',
  'propose_action', 'finalize_action', 'cancel_action', 'admin_withdraw', 'update_config', 'inactivity_recover',
]);

export type SolanaInstructionEvent = { chain: 'solana'; type: string; signature: string; slot: number; ts: number };

/** Names every top-level program instruction of a fetched transaction by its IDL discriminator. */
export function programInstructions(tx: { transaction: { message: { staticAccountKeys: PublicKey[]; compiledInstructions: { programIdIndex: number; data: Uint8Array }[] } } }, program = LOCKERS.solanaProgram): string[] {
  const keys = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());
  return tx.transaction.message.compiledInstructions
    .filter(ix => keys[ix.programIdIndex] === program)
    .map(ix => INSTRUCTION_BY_DISCRIMINATOR.get(Buffer.from(ix.data).subarray(0, 8).toString('hex')) ?? 'unknown');
}

/** Program instructions since `untilSignature` (exclusive), newest first, capped at `limit` transactions. */
export async function solanaInstructionEvents(untilSignature?: string, limit = 25): Promise<{ events: SolanaInstructionEvent[]; newest?: string }> {
  const conn = solConnection();
  const sigs = await conn.getSignaturesForAddress(new PublicKey(LOCKERS.solanaProgram), { until: untilSignature, limit });
  const events: SolanaInstructionEvent[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    for (const name of programInstructions(tx as never)) {
      events.push({ chain: 'solana', type: name, signature: s.signature, slot: s.slot, ts: (s.blockTime ?? 0) * 1000 });
    }
    await new Promise(r => setTimeout(r, Number(process.env.SOLANA_TX_DELAY_MS ?? 150)));
  }
  return { events, newest: sigs[0]?.signature ?? untilSignature };
}

/** Full Solana safety picture for M3: decoded VaultState plus open queued withdrawals / timelocked actions. */
export async function solanaSafetyFull() {
  const conn = solConnection();
  const address = PublicKey.findProgramAddressSync([Buffer.from('state'), new PublicKey(LOCKERS.solana).toBuffer()], new PublicKey(LOCKERS.solanaProgram))[0];
  const [acc, pending] = await Promise.all([conn.getAccountInfoAndContext(address), solanaPendingItems()]);
  if (!acc.value) throw new Error(`VaultState ${address.toBase58()} not found`);
  return { ...decodeVaultStateFull(Buffer.from(acc.value.data)), pending, address: address.toBase58(), slot: acc.context.slot };
}
