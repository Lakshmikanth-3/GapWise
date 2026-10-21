import { formatUnits } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js';
import { client, vaultAbi } from './ethereum';
import { env, LOCKERS } from '../core/config';
import { dayOf } from './stats';
import type { GetPrice } from './prices';
import type { Chain } from './types';

/** One on-chain movement into (+) or out of (−) a locker, valued in USD where a price source exists. */
export type Flow = { chain: Chain; ts: number; tx: string; asset: string; amount: number; usd?: number };
export type OnchainDay = { day: string; chain: Chain; in: number; out: number; unpricedMoves: number };
/** What a collector could actually see; days outside [fromTs, toTs] are not comparable. */
export type FlowCoverage = { chain: Chain; fromTs: number; toTs: number; note?: string };

export function bucketFlows(flows: Flow[]): OnchainDay[] {
  const m = new Map<string, OnchainDay>();
  for (const f of flows) {
    const k = `${dayOf(f.ts)}|${f.chain}`;
    if (!m.has(k)) m.set(k, { day: dayOf(f.ts), chain: f.chain, in: 0, out: 0, unpricedMoves: 0 });
    const d = m.get(k)!;
    if (f.usd === undefined) { d.unpricedMoves++; continue; }
    if (f.usd >= 0) d.in += f.usd; else d.out += -f.usd;
  }
  return [...m.values()];
}

// ---------- Ethereum: decoded Deposit / Withdraw / AdminWithdraw* events ----------

const ETH_FLOW_EVENTS = new Set(['Deposit', 'Withdraw', 'AdminWithdrawERC20', 'AdminWithdrawETH', 'AdminDepositERC20', 'AdminDepositETH']);
const ETH_DECIMALS: Record<string, number> = { '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, '0xdac17f958d2ee523a2206206994597c13d831ec7': 6 };
const NATIVE = '0x0000000000000000000000000000000000000000';

export async function ethFlows(sinceMs: number, getPrice: GetPrice, chunk = BigInt(process.env.ETH_LOGS_CHUNK ?? 5000)): Promise<{ flows: Flow[]; coverage: FlowCoverage }> {
  const c = client();
  const head = await c.getBlock();
  const headTs = Number(head.timestamp) * 1000;
  // ~12 s blocks; refined below from real block timestamps.
  const fromBlock = head.number! - BigInt(Math.ceil((headTs - sinceMs) / 12_000));
  const logs: any[] = [];
  let coveredFrom = head.number!;
  let note: string | undefined;
  for (let to = head.number!; to >= fromBlock; to -= chunk) {
    const from = to - chunk + 1n > fromBlock ? to - chunk + 1n : fromBlock;
    try {
      logs.push(...await c.getContractEvents({ address: LOCKERS.ethereum as `0x${string}`, abi: vaultAbi, fromBlock: from, toBlock: to }));
      coveredFrom = from;
    } catch (e) {
      note = `RPC refused logs before block ${coveredFrom} (${(e as Error).message.split('\n')[0]}); set ETH_RPC_URL to an archive-capable provider`;
      break;
    }
  }
  const tsCache = new Map<bigint, number>();
  const tsOf = async (n: bigint) => {
    if (!tsCache.has(n)) tsCache.set(n, Number((await c.getBlock({ blockNumber: n })).timestamp) * 1000);
    return tsCache.get(n)!;
  };
  const flows: Flow[] = [];
  for (const l of logs) {
    if (!ETH_FLOW_EVENTS.has(l.eventName)) continue;
    const a = l.args as { token?: string; amount: bigint };
    const token = (a.token ?? NATIVE).toLowerCase();
    const isEth = token === NATIVE || l.eventName.endsWith('ETH');
    const amount = Number(formatUnits(a.amount, isEth ? 18 : ETH_DECIMALS[token] ?? 18));
    const sign = l.eventName.includes('Deposit') ? 1 : -1;
    const q = await getPrice(isEth ? { chain: 'ethereum', asset: 'ETH' } : { chain: 'ethereum', asset: token, contract: a.token });
    flows.push({ chain: 'ethereum', ts: await tsOf(l.blockNumber), tx: l.transactionHash, asset: isEth ? 'ETH' : token, amount: sign * amount, usd: q.usd === undefined ? undefined : sign * amount * q.usd });
  }
  return { flows, coverage: { chain: 'ethereum', fromTs: await tsOf(coveredFrom), toTs: headTs, note } };
}

// ---------- Solana: token-balance deltas of the locker's token accounts ----------

export async function solanaFlows(sinceMs: number, getPrice: GetPrice): Promise<{ flows: Flow[]; coverage: FlowCoverage }> {
  const conn = new Connection(env.solRpc(), 'confirmed');
  const owner = new PublicKey(LOCKERS.solana);
  const accounts = (await conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') })).value;
  const flows: Flow[] = [];
  for (const acc of accounts) {
    const mint = (acc.account.data as any).parsed.info.mint as string;
    const q = await getPrice({ chain: 'solana', asset: mint, contract: mint });
    let before: string | undefined;
    for (;;) {
      const sigs = await conn.getSignaturesForAddress(acc.pubkey, { before, limit: 1000 });
      if (!sigs.length) break;
      for (const s of sigs) {
        if (s.err || !s.blockTime) continue;
        if (s.blockTime * 1000 < sinceMs) { before = undefined; break; }
        await new Promise(r => setTimeout(r, Number(process.env.SOLANA_TX_DELAY_MS ?? 250))); // public RPC rate limit
        const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
        const keys = tx?.transaction.message.accountKeys.map(k => k.pubkey.toBase58()) ?? [];
        const idx = keys.indexOf(acc.pubkey.toBase58());
        const pre = tx?.meta?.preTokenBalances?.find(b => b.accountIndex === idx)?.uiTokenAmount.uiAmountString ?? '0';
        const post = tx?.meta?.postTokenBalances?.find(b => b.accountIndex === idx)?.uiTokenAmount.uiAmountString ?? '0';
        const delta = Number(post) - Number(pre);
        if (delta !== 0) flows.push({ chain: 'solana', ts: s.blockTime * 1000, tx: s.signature, asset: mint, amount: delta, usd: q.usd === undefined ? undefined : delta * q.usd });
      }
      const last = sigs[sigs.length - 1];
      if (!last.blockTime || last.blockTime * 1000 < sinceMs || sigs.length < 1000) break;
      before = last.signature;
    }
  }
  return { flows, coverage: { chain: 'solana', fromTs: sinceMs, toTs: Date.now() } };
}

// ---------- Cardano: net value change of the two locker scripts per transaction ----------

const KOIOS = 'https://api.koios.rest/api/v1';
async function koios<T>(path: string, body: unknown): Promise<T> {
  for (let k = 0; ; k++) {
    const r = await fetch(`${KOIOS}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json() as Promise<T>;
    if (k >= 4) throw new Error(`Koios ${path} ${r.status}`);
    await new Promise(s => setTimeout(s, 1500 * (k + 1)));
  }
}

type KUtxo = { value: string; payment_addr: { bech32: string }; asset_list: { policy_id: string; asset_name: string; quantity: string; decimals?: number }[] };

/**
 * Internal moves (deposit script → protocol script batches) net to zero because both scripts are one set.
 * ADA is valued at the current Strike index price (historic prices are not available from the feed) — labelled.
 */
export async function cardanoFlows(sinceMs: number, getPrice: GetPrice): Promise<{ flows: Flow[]; coverage: FlowCoverage }> {
  const set = new Set<string>(LOCKERS.cardano);
  const txs: { tx_hash: string; block_time: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await koios<{ tx_hash: string; block_time: number }[]>(`address_txs?offset=${offset}&limit=1000&order=block_height.desc`, { _addresses: [...set] });
    txs.push(...page.filter(t => t.block_time * 1000 >= sinceMs));
    if (page.length < 1000 || page[page.length - 1].block_time * 1000 < sinceMs) break;
  }
  const uniq = [...new Map(txs.map(t => [t.tx_hash, t])).values()];
  const flows: Flow[] = [];
  const priceCache = new Map<string, number | undefined>();
  const usdOf = async (unit: string, amount: number) => {
    if (!priceCache.has(unit)) {
      const q = unit === 'lovelace' ? await getPrice({ chain: 'cardano', asset: 'ADA' }) : await getPrice({ chain: 'cardano', asset: unit, contract: unit });
      priceCache.set(unit, q.usd);
    }
    const p = priceCache.get(unit);
    return p === undefined ? undefined : amount * p;
  };
  for (let i = 0; i < uniq.length; i += 25) {
    const batch = await koios<{ tx_hash: string; inputs: KUtxo[]; outputs: KUtxo[] }[]>('tx_utxos', { _tx_hashes: uniq.slice(i, i + 25).map(t => t.tx_hash) });
    for (const t of batch) {
      const net = new Map<string, { qty: bigint; decimals: number }>();
      const add = (u: KUtxo, sign: bigint) => {
        if (!set.has(u.payment_addr.bech32)) return;
        const l = net.get('lovelace') ?? { qty: 0n, decimals: 6 };
        net.set('lovelace', { qty: l.qty + sign * BigInt(u.value), decimals: 6 });
        for (const a of u.asset_list) {
          const k = a.policy_id + a.asset_name;
          const prev = net.get(k) ?? { qty: 0n, decimals: a.decimals ?? 0 };
          net.set(k, { qty: prev.qty + sign * BigInt(a.quantity), decimals: prev.decimals });
        }
      };
      t.outputs.forEach(u => add(u, 1n));
      t.inputs.forEach(u => add(u, -1n));
      const ts = uniq.find(u => u.tx_hash === t.tx_hash)!.block_time * 1000;
      for (const [unit, { qty, decimals }] of net) {
        if (qty === 0n || unit.startsWith('43dfa7d041840e1280102ab87ccb17051bb4e5c14bf27bda2608e9fc')) continue;
        const amount = Number(qty) / 10 ** decimals;
        flows.push({ chain: 'cardano', ts, tx: t.tx_hash, asset: unit === 'lovelace' ? 'ADA' : unit, amount, usd: await usdOf(unit, amount) });
      }
    }
  }
  return { flows, coverage: { chain: 'cardano', fromTs: sinceMs, toTs: Date.now(), note: 'ADA valued at current Strike index price' } };
}
