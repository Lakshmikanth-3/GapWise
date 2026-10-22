import { env, LOCKERS, NET } from '../core/config';
import type { Reserve } from './types';

const BF = NET.blockfrost;
const KOIOS = NET.koios;

/** Cardano policy id → ticker, for display. Pricing is decided in core/valuation by contract id. */
export const CARDANO_POLICIES: Record<string, string> = {
  '1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34': 'USDCx',
  'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad': 'USDM',
  'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880': 'iUSD',
  '7d9e4a0ee1a3f5d5ff8159ea91a83310cf2795ee7a87170c7aea05ae': 'sUSDrf',
  '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d56': 'LP_SUNDAE_USDCx_USDM',
};
/**
 * Decimals from Strike's /v2/credit/settings custody mappings (raw_amount_scale) where token metadata is missing:
 * the SundaeSwap LP token has empty CIP-68 metadata, so Koios reports 0 decimals; Strike values it with 6.
 */
export const CARDANO_DECIMALS: Record<string, number> = {
  '4de79a0c17180030bff4c36825cb6e99caa007bc632f789561a26d56': 6,
};
/** Protocol state tokens held by the script (e.g. STRIKE_V21_PROTOCOL); not reserves. */
export const CARDANO_NON_RESERVE = new Set(['43dfa7d041840e1280102ab87ccb17051bb4e5c14bf27bda2608e9fc']);

type Token = { policy: string; nameHex: string; quantity: bigint; decimals: number };

export function toReserves(holder: string, lovelace: bigint, tokens: Token[]): Reserve[] {
  const out: Reserve[] = [{ chain: 'cardano', asset: 'ADA', amount: Number(lovelace) / 1e6, raw: lovelace.toString(), decimals: 6, holder }];
  for (const t of tokens) {
    if (CARDANO_NON_RESERVE.has(t.policy)) continue;
    const name = Buffer.from(t.nameHex, 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '') || t.nameHex;
    const decimals = CARDANO_DECIMALS[t.policy] ?? t.decimals;
    out.push({ chain: 'cardano', asset: CARDANO_POLICIES[t.policy] ?? name, amount: Number(t.quantity) / 10 ** decimals, raw: t.quantity.toString(), decimals, contract: t.policy + t.nameHex, holder });
  }
  return out;
}

type KoiosInfo = { address: string; balance: string; utxo_set: { asset_list: { policy_id: string; asset_name: string; quantity: string; decimals: number }[] }[] };

async function viaKoios(addresses: readonly string[]): Promise<Reserve[]> {
  const res = await fetch(`${KOIOS}/address_info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _addresses: addresses }) });
  if (!res.ok) throw new Error(`Koios ${res.status}`);
  const infos = await res.json() as KoiosInfo[];
  if (infos.length !== addresses.length) throw new Error(`Koios returned ${infos.length}/${addresses.length} addresses`);
  return infos.flatMap(info => {
    const agg = new Map<string, Token>();
    for (const u of info.utxo_set) for (const a of u.asset_list) {
      const k = a.policy_id + a.asset_name;
      agg.set(k, { policy: a.policy_id, nameHex: a.asset_name, decimals: a.decimals ?? 0, quantity: (agg.get(k)?.quantity ?? 0n) + BigInt(a.quantity) });
    }
    return toReserves(info.address, BigInt(info.balance), [...agg.values()]);
  });
}

async function viaBlockfrost(key: string, addresses: readonly string[]): Promise<Reserve[]> {
  const h = { project_id: key };
  const out: Reserve[] = [];
  for (const addr of addresses) {
    const res = await fetch(`${BF}/addresses/${addr}`, { headers: h });
    if (!res.ok) throw new Error(`Blockfrost ${res.status}`);
    const body = await res.json() as { amount: { unit: string; quantity: string }[] };
    const tokens: Token[] = [];
    let lovelace = 0n;
    for (const a of body.amount) {
      if (a.unit === 'lovelace') { lovelace = BigInt(a.quantity); continue; }
      const meta = await (await fetch(`${BF}/assets/${a.unit}`, { headers: h })).json() as { metadata?: { decimals?: number } };
      tokens.push({ policy: a.unit.slice(0, 56), nameHex: a.unit.slice(56), quantity: BigInt(a.quantity), decimals: meta.metadata?.decimals ?? 0 });
    }
    out.push(...toReserves(addr, lovelace, tokens));
  }
  return out;
}

export async function cardanoReserves(addresses: readonly string[] = LOCKERS.cardano): Promise<Reserve[]> {
  const key = env.blockfrost();
  return key ? viaBlockfrost(key, addresses) : viaKoios(addresses);
}
