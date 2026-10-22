import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import idl from '../packages/collectors/abi/solana-vault.idl.json' with { type: 'json' };
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const program = new PublicKey('FSNjjtrZP2BiuPfyRjTWQUybN8QNnEQgUogho79SMzXt');
const disc = (n: string) => Buffer.from(idl.accounts.find(a => a.name === n)!.discriminator);
for (const name of ['Vault', 'VaultState', 'PendingWithdrawal', 'PendingAction']) {
  const accs = await conn.getProgramAccounts(program, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc(name)) } }], dataSlice: { offset: 0, length: 0 } });
  console.log(name, accs.length, accs.slice(0, 3).map(a => a.pubkey.toBase58()));
  if (name === 'Vault') for (const a of accs) {
    const treasury = PublicKey.findProgramAddressSync([Buffer.from('treasury'), a.pubkey.toBuffer()], program)[0];
    const state = PublicKey.findProgramAddressSync([Buffer.from('state'), a.pubkey.toBuffer()], program)[0];
    const toks = await conn.getParsedTokenAccountsByOwner(a.pubkey, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
    const ttoks = await conn.getParsedTokenAccountsByOwner(treasury, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
    console.log(' vault', a.pubkey.toBase58(), 'SOL', (await conn.getBalance(a.pubkey)) / 1e9, '| treasury', treasury.toBase58(), 'SOL', (await conn.getBalance(treasury)) / 1e9, '| state', state.toBase58());
    for (const t of [...toks.value, ...ttoks.value]) { const i = (t.account.data as any).parsed.info; console.log('   token acct', t.pubkey.toBase58(), 'owner', i.owner.slice(0, 6), 'mint', i.mint, i.tokenAmount.uiAmountString); }
  }
}
const koios = 'https://preprod.koios.rest/api/v1';
const info = await (await fetch(`${koios}/address_info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _addresses: ['addr_test1wpuakhm8ftcwy2t00vhxp3rmqev90cs5xqf6ynu7f7rxrrg4rlm70'] }) })).json() as any[];
const agg: Record<string, bigint> = {};
for (const u of info[0].utxo_set) for (const a of u.asset_list) { const k = `${a.policy_id.slice(0, 8)}…${Buffer.from(a.asset_name, 'hex').toString('latin1').replace(/[^\x20-\x7e]/g, '')}(dec ${a.decimals})`; agg[k] = (agg[k] ?? 0n) + BigInt(a.quantity); }
console.log('cardano preprod script ADA', Number(info[0].balance) / 1e6, 'utxos', info[0].utxo_set.length, agg);
