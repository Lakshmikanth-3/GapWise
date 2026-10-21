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

export async function reportedTransfers(base = env.strikeApi): Promise<ReportedDay[]> {
  const res = await fetch(`${base}/stat/v1/dashboard/transfers`);
  if (!res.ok) throw new Error(`transfers ${res.status}`);
  return parseTransfers(await res.json() as { deposits: Row[]; withdrawals: Row[] });
}

export const LOCKER_CHAINS: Chain[] = ['ethereum', 'solana', 'cardano'];
