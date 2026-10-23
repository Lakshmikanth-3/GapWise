import { env } from '../core/config';
import type { Chain } from './types';

// GET /stat/v1/dashboard/transfers (docs: "daily deposits and withdrawals (USD) grouped by source chain").
// Live shape: { deposits: [[dayStartMs, chain, usd], ...], withdrawals: [...] }; chains include non-locker
// sources (arbitrum, base, bsc, bitcoin, tron, internal, ...) which we keep but cannot match on-chain.
type Row = [number, string, number];
export type ReportedDay = { day: string; chain: string; in: number; out: number };

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function parseTransfers(body: { deposits: Row[]; withdrawals: Row[] }): ReportedDay[] {
  const m = new Map<string, ReportedDay>();
  const at = (ts: number, chain: string) => {
    const k = `${dayOf(ts)}|${chain}`;
    if (!m.has(k)) m.set(k, { day: dayOf(ts), chain, in: 0, out: 0 });
    return m.get(k)!;
  };
  for (const [ts, chain, usd] of body.deposits) at(ts, chain).in += Number(usd);
  for (const [ts, chain, usd] of body.withdrawals) at(ts, chain).out += Number(usd);
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day) || a.chain.localeCompare(b.chain));
}

/**
 * Deposits from chains without their own Strike locker (Solana deposits routed via the relayer, base, bsc, polygon …)
 * arrive as USDC in the Ethereum locker, sent by the relayer (founder, 23 Oct; 22 Oct: polygon 377.62, bsc 103.83,
 * base 468.66 + 468.71, solana 999.60 each matched one relayer deposit). On-chain those relayer deposits are booked in
 * the 'solana' row (see flows.ts SOLANA_RELAYER), so the reported deposits of the relayed chains are folded into that
 * row too: one comparable "Solana + relayed" figure per day. Withdrawals are not folded (they match per chain).
 */
export const RELAYED_CHAINS = ['arbitrum', 'base', 'bsc', 'polygon', 'optimism', 'hyperevm', 'bitcoin', 'tron'];
export function foldRelayedDeposits(rows: ReportedDay[]): ReportedDay[] {
  const out = rows.map(r => ({ ...r }));
  for (const r of rows) {
    if (!RELAYED_CHAINS.includes(r.chain) || !r.in) continue;
    let sol = out.find(x => x.day === r.day && x.chain === 'solana');
    if (!sol) { sol = { day: r.day, chain: 'solana', in: 0, out: 0 }; out.push(sol); }
    sol.in += r.in;
    out.find(x => x.day === r.day && x.chain === r.chain)!.in = 0;
  }
  return out;
}

export async function reportedTransfers(base = env.strikeApi): Promise<ReportedDay[]> {
  const res = await fetch(`${base}/stat/v1/dashboard/transfers`);
  if (!res.ok) throw new Error(`transfers ${res.status}`);
  return foldRelayedDeposits(parseTransfers(await res.json() as { deposits: Row[]; withdrawals: Row[] }));
}

export const LOCKER_CHAINS: Chain[] = ['ethereum', 'solana', 'cardano'];
