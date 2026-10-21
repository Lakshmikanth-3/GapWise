import { env, LOCKERS } from '../core/config';
import type { Reserve } from './types';

const BF = 'https://cardano-mainnet.blockfrost.io/api/v0';
const KOIOS = 'https://api.koios.rest/api/v1';

/** Known USD stablecoins on Cardano, keyed by policy id. Unknown tokens stay unpriced (flagged). */
export const CARDANO_STABLES: Record<string, string> = {
  "1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34": "USDCx",
  "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad": "USDM",
  "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880": "iUSD",
};
/** Protocol state tokens held by the script; not reserves. */
export const CARDANO_NON_RESERVE = new Set(["43dfa7d041840e1280102ab87ccb17051bb4e5c14bf27bda2608e9fc"]);

type Token = { policy: string; nameHex: string; quantity: bigint; decimals: number };

export function toReserves(lovelace: bigint, tokens: Token[]): Reserve[] {
  const out: Reserve[] = [{ chain: 'cardano', asset: 'ADA', amount: Number(lovelace) / 1e6, raw: lovelace.toString(), decimals: 6 }];
  for (const t of tokens) {
    if (CARDANO_NON_RESERVE.has(t.policy)) continue;
    const ticker = CARDANO_STABLES[t.policy];
    const name = Buffer.from(t.nameHex, 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '') || t.nameHex;
    out.push({ chain: 'cardano', asset: ticker ?? name, amount: Number(t.quantity) / 10 ** t.decimals, raw: t.quantity.toString(), decimals: t.decimals, contract: t.policy + t.nameHex, stable: !!ticker });
  }
  return out;
}

async function viaKoios(): Promise<Reserve[]> {
  const res = await fetch(`${KOIOS}/address_info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _addresses: [LOCKERS.cardano] }) });
  if (!res.ok) throw new Error(`Koios ${res.status}`);
  const [info] = await res.json() as { balance: string; utxo_set: { asset_list: { policy_id: string; asset_name: string; quantity: string; decimals: number }[] }[] }[];
  const agg = new Map<string, Token>();
  for (const u of info.utxo_set) for (const a of u.asset_list) {
    const k = a.policy_id + a.asset_name;
    const prev = agg.get(k);
    agg.set(k, { policy: a.policy_id, nameHex: a.asset_name, decimals: a.decimals ?? 0, quantity: (prev?.quantity ?? 0n) + BigInt(a.quantity) });
  }
  return toReserves(BigInt(info.balance), [...agg.values()]);
}

async function viaBlockfrost(key: string): Promise<Reserve[]> {
  const h = { project_id: key };
  const res = await fetch(`${BF}/addresses/${LOCKERS.cardano}`, { headers: h });
  if (!res.ok) throw new Error(`Blockfrost ${res.status}`);
  const body = await res.json() as { amount: { unit: string; quantity: string }[] };
  const tokens: Token[] = [];
  let lovelace = 0n;
  for (const a of body.amount) {
    if (a.unit === 'lovelace') { lovelace = BigInt(a.quantity); continue; }
    const meta = await (await fetch(`${BF}/assets/${a.unit}`, { headers: h })).json() as { metadata?: { decimals?: number }; metadata_decimals?: number };
    tokens.push({ policy: a.unit.slice(0, 56), nameHex: a.unit.slice(56), quantity: BigInt(a.quantity), decimals: meta.metadata?.decimals ?? 0 });
  }
  return toReserves(lovelace, tokens);
}

export async function cardanoReserves(): Promise<Reserve[]> {
  const key = env.blockfrost();
  return key ? viaBlockfrost(key) : viaKoios();
}
