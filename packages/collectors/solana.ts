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

// TODO(corrected IDL): the IDL in abi/ is the "strike_example" file. Balance reads only — do NOT decode
// VaultState, instructions or logs from it. When Shan sends the corrected IDL, confirm the funds account
// and replace the treasury-PDA read below.
// Reads SOL + SPL of the locker Dj9NkHy… (as instructed) and, balance-only, of the treasury PDA
// derived from it — on 22 Oct the locker's owning program was 7XASQ24f…, see docs/DECISIONS.md #5.
export async function solanaReserves(): Promise<Reserve[]> {
  const conn = new Connection(env.solRpc(), 'confirmed');
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
