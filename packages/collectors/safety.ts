import { client, vaultAbi, SAFETY_EVENTS } from './ethereum';
import { LOCKERS } from '../core/config';

const vault = () => LOCKERS.ethereum as `0x${string}`;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;

export type Bucket = { limit: number; current: number; previous: number; windowStart: number; windowSecs: number; usedPct: number };

/**
 * Sliding-window usage as the contract computes it: current + previous × (remaining share of the window).
 * rateLimitBucket(asset, isGlobal, window) — window is in hours (1 or 24; other values revert, verified live).
 */
export function bucketOf(raw: readonly [bigint, bigint, bigint, bigint, bigint], windowHours: number, decimals: number, nowSecs: number): Bucket {
  const [limit, current, previous, start] = raw;
  const windowSecs = windowHours * 3600;
  const elapsed = Math.max(0, Math.min(windowSecs, nowSecs - Number(start)));
  const scale = 10 ** decimals;
  const used = Number(current) / scale + (Number(previous) / scale) * (1 - elapsed / windowSecs);
  const lim = Number(limit) / scale;
  return { limit: lim, current: Number(current) / scale, previous: Number(previous) / scale, windowStart: Number(start), windowSecs, usedPct: lim > 0 ? Math.round((used / lim) * 10000) / 100 : 0 };
}

export type EthSafetyState = {
  ts: number; block: number; paused: boolean; pauseEpoch: number;
  largeWithdrawal: { thresholdBudgetUnits: number; queueDelaySecs: number; maxPending: number; pendingCount: number };
  timelock: { delaySecs: number; expiryWindowSecs: number };
  usdc1h: Bucket; usdc24h: Bucket; global1h: Bucket; global24h: Bucket;
  source: string;
};

export async function ethSafetyState(): Promise<EthSafetyState> {
  const c = client(); const address = vault();
  const read = (functionName: string, args: readonly unknown[] = []) => c.readContract({ address, abi: vaultAbi, functionName, args } as never) as Promise<any>;
  const [block, paused, epoch, lw, tl, u1, u24, g1, g24] = await Promise.all([
    c.getBlock(), read('isPaused'), read('pauseEpoch'), read('largeWithdrawalConfig'), read('timelockConfig'),
    read('rateLimitBucket', [USDC, false, 1]), read('rateLimitBucket', [USDC, false, 24]),
    read('rateLimitBucket', [ZERO, true, 1]), read('rateLimitBucket', [ZERO, true, 24]),
  ]);
  const now = Number(block.timestamp);
  return {
    ts: now * 1000, block: Number(block.number), paused, pauseEpoch: Number(epoch),
    largeWithdrawal: { thresholdBudgetUnits: Number(lw[0]), queueDelaySecs: Number(lw[1]), maxPending: Number(lw[2]), pendingCount: Number(lw[3]) },
    timelock: { delaySecs: Number(tl[0]), expiryWindowSecs: Number(tl[1]) },
    usdc1h: bucketOf(u1, 1, 6, now), usdc24h: bucketOf(u24, 24, 6, now),
    // Global buckets are in "budget units" (USD-weighted), not token units.
    global1h: bucketOf(g1, 1, 0, now), global24h: bucketOf(g24, 24, 0, now),
    source: `eth_call ${address} @${Number(block.number)}`,
  };
}

/** Safety-control events plus regular Deposit/Withdraw (shown in the feed; never alerted on their own). */
export const FEED_EVENTS = new Set<string>([...SAFETY_EVENTS, 'Deposit', 'Withdraw']);

export type SafetyEvent = { chain: 'ethereum'; type: string; block: number; tx: string; ts: number; args: Record<string, string> };

const plain = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : String(v)]));

/** Decoded safety-relevant events in [fromBlock, toBlock] (FR-3.1). */
export async function ethSafetyEventsBetween(fromBlock: bigint, toBlock: bigint): Promise<SafetyEvent[]> {
  const c = client();
  const logs = await c.getContractEvents({ address: vault(), abi: vaultAbi, fromBlock, toBlock });
  const ts = new Map<bigint, number>();
  const out: SafetyEvent[] = [];
  for (const l of logs as any[]) {
    if (!FEED_EVENTS.has(l.eventName)) continue;
    if (!ts.has(l.blockNumber)) ts.set(l.blockNumber, Number((await c.getBlock({ blockNumber: l.blockNumber })).timestamp) * 1000);
    out.push({ chain: 'ethereum', type: l.eventName, block: Number(l.blockNumber), tx: l.transactionHash, ts: ts.get(l.blockNumber)!, args: plain(l.args) });
  }
  return out;
}

/** Queued large withdrawals / timelocked actions still open within the events seen. */
export function openItems(events: SafetyEvent[]) {
  const queued = new Map<string, SafetyEvent>(); const actions = new Map<string, SafetyEvent>();
  for (const e of [...events].sort((a, b) => a.block - b.block)) {
    if (e.type === 'LargeWithdrawalQueued') queued.set(e.args.requestID, e);
    if (e.type === 'LargeWithdrawalExecuted' || e.type === 'LargeWithdrawalCancelled') queued.delete(e.args.requestID);
    if (e.type === 'ActionProposed') actions.set(e.args.actionId, e);
    if (e.type === 'ActionFinalized' || e.type === 'ActionCancelled') actions.delete(e.args.actionId);
  }
  return { queued: [...queued.values()], actions: [...actions.values()] };
}
