import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { env, LOCKERS } from '../core/config';
import type { Reserve } from './types';

/** Known mints → ticker. Pricing is decided in core/valuation, not here. */
export const SOLANA_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

/** Treasury PDA = ["treasury", vault] under the program that owns the locker account. */
export function treasuryPda(vault = LOCKERS.solana, program = LOCKERS.solanaProgram): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury'), new PublicKey(vault).toBuffer()], new PublicKey(program))[0];
}

// Corrected IDL confirmed by the founder (22 Oct): program 7XASQ24f… "strike_vault". Funds: the USDC token
// account BT85fgyh… owned by the vault account Dj9NkHy…, plus the treasury PDA ["treasury", vault] for SOL.
export async function solanaReserves(): Promise<Reserve[]> {
  const conn = solConnection();
  const owners = [new PublicKey(LOCKERS.solana), treasuryPda()];
  const out: Reserve[] = [];
  for (const owner of owners) {
    const holder = owner.toBase58();
    const [lamports, tokens] = await Promise.all([
      conn.getBalance(owner),
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    ]);
    if (lamports > 0) out.push({ chain: 'solana', asset: 'SOL', amount: lamports / LAMPORTS_PER_SOL, raw: String(lamports), decimals: 9, holder });
    for (const t of tokens.value) {
      const info = (t.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString: string } } } }).parsed.info;
      out.push({ chain: 'solana', asset: SOLANA_MINTS[info.mint] ?? info.mint, amount: Number(info.tokenAmount.uiAmountString), raw: info.tokenAmount.amount, decimals: info.tokenAmount.decimals, contract: info.mint, holder });
    }
  }
  return out;
}

/** Solana RPC client using the standard global fetch (same in production; interceptable in tests). */
export function solConnection(): Connection {
  return new Connection(env.solRpc(), { commitment: 'confirmed', fetch: (input, init) => fetch(input, init) });
}

/** VaultState PDA = ["state", vault] (IDL account constraints). */
export function statePda(vault = LOCKERS.solana, program = LOCKERS.solanaProgram): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('state'), new PublicKey(vault).toBuffer()], new PublicKey(program))[0];
}

const VAULT_STATE_DISCRIMINATOR = Buffer.from([228, 196, 82, 165, 98, 210, 235, 152]);

export type SolanaVaultState = {
  paused: boolean; pauseEpoch: number; withdrawSignerEpoch: number; lastActivityAt: number;
  pendingWithdrawalCount: number; recovered: boolean;
  globalUsage1h: { windowStart: number; current: number; previous: number };
  globalUsage24h: { windowStart: number; current: number; previous: number };
};

/** Borsh decode of the leading VaultState fields (layout from the IDL; integers little-endian). */
export function decodeVaultState(data: Buffer): SolanaVaultState {
  if (!data.subarray(0, 8).equals(VAULT_STATE_DISCRIMINATOR)) throw new Error('not a VaultState account');
  let o = 8;
  const u8 = () => data.readUInt8(o++);
  const u16 = () => { const v = data.readUInt16LE(o); o += 2; return v; };
  const u64 = () => { const v = Number(data.readBigUInt64LE(o)); o += 8; return v; };
  const i64 = () => { const v = Number(data.readBigInt64LE(o)); o += 8; return v; };
  const window = () => ({ windowStart: i64(), current: u64(), previous: u64() });
  return {
    paused: u8() === 1, pauseEpoch: u64(), withdrawSignerEpoch: u64(), lastActivityAt: i64(),
    pendingWithdrawalCount: u16(), recovered: u8() === 1, globalUsage1h: window(), globalUsage24h: window(),
  };
}

export async function solanaSafetyState(): Promise<SolanaVaultState & { address: string; slot: number }> {
  const conn = solConnection();
  const address = statePda();
  const res = await conn.getAccountInfoAndContext(address);
  if (!res.value) throw new Error(`VaultState ${address.toBase58()} not found`);
  return { ...decodeVaultState(Buffer.from(res.value.data)), address: address.toBase58(), slot: res.context.slot };
}
