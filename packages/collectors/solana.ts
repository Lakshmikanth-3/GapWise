import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { env, LOCKERS } from '../core/config';
import type { Reserve } from './types';

export const SOLANA_STABLES: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

/** Treasury PDA = ["treasury", vault] under the vault program (seeds from the IDL's account constraints). */
export function treasuryPda(vault = LOCKERS.solana, program = LOCKERS.solanaProgram): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury'), new PublicKey(vault).toBuffer()], new PublicKey(program))[0];
}

// Balances only. TODO: the IDL in abi/ is labelled "strike_example"; do NOT decode VaultState or
// program logs until Shan sends the corrected mainnet IDL.
// Live finding (22 Oct): the USDC token account is owned by the vault account itself, while the
// treasury PDA holds the SOL. We read SPL tokens owned by both, and SOL from the treasury only
// (the vault account's lamports are rent for its own data).
export async function solanaReserves(): Promise<Reserve[]> {
  const conn = new Connection(env.solRpc(), 'confirmed');
  const treasury = treasuryPda();
  const vault = new PublicKey(LOCKERS.solana);
  const [lamports, ...tokenSets] = await Promise.all([
    conn.getBalance(treasury),
    ...[vault, treasury].map(o => conn.getParsedTokenAccountsByOwner(o, { programId: TOKEN_PROGRAM_ID })),
  ]);
  const out: Reserve[] = [{ chain: 'solana', asset: 'SOL', amount: lamports / LAMPORTS_PER_SOL, raw: String(lamports), decimals: 9, holder: treasury.toBase58() }];
  for (const tokens of tokenSets) for (const t of tokens.value) {
    const holder = t.pubkey.toBase58();
    const info = (t.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString: string } } } }).parsed.info;
    const sym = SOLANA_STABLES[info.mint];
    out.push({ chain: 'solana', asset: sym ?? info.mint, amount: Number(info.tokenAmount.uiAmountString), raw: info.tokenAmount.amount, decimals: info.tokenAmount.decimals, contract: info.mint, stable: !!sym, holder });
  }
  return out;
}
