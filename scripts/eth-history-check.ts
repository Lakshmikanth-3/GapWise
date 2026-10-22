// Full-history Ethereum check (Alchemy Transfers API, free tier):
// 1) every token ever received by the vault → is it whitelisted, and does ZeroGap read it?
// 2) every depositor wallet → does a Strike account exist, is it in the leaderboard list, does it hold a balance?
import 'dotenv/config';
import { parseAbi, formatUnits, erc20Abi } from 'viem';
import { client } from '../packages/collectors/ethereum';
import { LOCKERS } from '../packages/core/config';
import { CANDIDATE_TOKENS, AAVE_AUSDC } from '../packages/collectors/ethereum';

const RPC = process.env.ETH_RPC_URL!;
const vault = LOCKERS.ethereum;
type T = { from: string; to: string; asset: string | null; value: number | null; rawContract: { address: string | null }; category: string; hash: string };
async function transfers(dir: 'toAddress' | 'fromAddress'): Promise<T[]> {
  const out: T[] = []; let pageKey: string | undefined;
  do {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [{ fromBlock: '0x0', toBlock: 'latest', [dir]: vault, category: ['external', 'erc20'], withMetadata: false, excludeZeroValue: true, maxCount: '0x3e8', ...(pageKey ? { pageKey } : {}) }] }) }).then(x => x.json()) as any;
    if (r.error) throw new Error(r.error.message);
    out.push(...r.result.transfers); pageKey = r.result.pageKey;
  } while (pageKey);
  return out;
}
const [inT, outT] = await Promise.all([transfers('toAddress'), transfers('fromAddress')]);
console.log(`vault transfers: ${inT.length} in, ${outT.length} out`);
const tokens = new Map<string, { asset: string; in: number; out: number }>();
for (const [list, k] of [[inT, 'in'], [outT, 'out']] as const) for (const t of list) {
  const addr = (t.rawContract.address ?? 'ETH').toLowerCase();
  const e = tokens.get(addr) ?? { asset: t.asset ?? '?', in: 0, out: 0 }; e[k] += t.value ?? 0; tokens.set(addr, e);
}
const c = client();
const known = new Set([...Object.values(CANDIDATE_TOKENS), AAVE_AUSDC].map(a => a.toLowerCase()));
console.log('\nTokens ever moved through the vault:');
for (const [addr, e] of tokens) {
  if (addr === 'eth') { console.log(`  ETH  in ${e.in} out ${e.out}`); continue; }
  const [wl, bal, dec] = await Promise.all([
    c.readContract({ address: vault as `0x${string}`, abi: parseAbi(['function isAssetWhitelisted(address) view returns (bool)']), functionName: 'isAssetWhitelisted', args: [addr as `0x${string}`] }).catch(() => 'n/a'),
    c.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [vault as `0x${string}`] }).catch(() => 0n),
    c.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
  ]);
  console.log(`  ${e.asset.padEnd(10)} ${addr} whitelisted=${wl} balanceNow=${formatUnits(bal as bigint, dec as number)} readByZeroGap=${known.has(addr)} in=${e.in.toFixed(2)} out=${e.out.toFixed(2)}`);
}
// Depositor coverage
const depositors = [...new Set(inT.map(t => t.from.toLowerCase()))];
const lb = await (await fetch(`${process.env.STRIKE_API ?? 'https://api.strikefinance.org'}/stat/v1/stats/leaderboard`)).json() as { entries: { account_id: string; blockchain_address: string }[] };
const lbAddr = new Set(lb.entries.map(e => (e.blockchain_address ?? '').toLowerCase()));
let inLb = 0, missing = 0, missingWithBalance = 0, noAccount = 0; const missingList: string[] = [];
for (const d of depositors) {
  if (lbAddr.has(d)) { inLb++; continue; }
  const r = await fetch(`https://api.strikefinance.org/v2/account?blockchain=ethereum&blockchain_address=${d}`);
  if (!r.ok) { noAccount++; continue; }
  const a = await r.json() as { margin_balance?: string };
  missing++; if (Number(a.margin_balance) > 0.01) { missingWithBalance++; missingList.push(`${d} $${Number(a.margin_balance).toFixed(2)}`); }
  await new Promise(s => setTimeout(s, 60));
}
console.log(`\nDepositor wallets: ${depositors.length} · in leaderboard ${inLb} · not in leaderboard but have an account ${missing} (with balance > $0.01: ${missingWithBalance}) · no Strike account ${noAccount}`);
for (const m of missingList) console.log('  MISSING WITH BALANCE', m);
