import { ethReserves } from './ethereum';
import { cardanoReserves } from './cardano';
import { solanaReserves } from './solana';
import { createPricer, type GetPrice } from './prices';
import { valueReserves } from '../core/valuation';
import type { Chain, Reserve } from './types';

export type ReserveSnapshot = Awaited<ReturnType<typeof valueReserves<Reserve>>> & { ts: number; failedChains: Chain[] };

const COLLECTORS: Record<Chain, () => Promise<Reserve[]>> = { ethereum: ethReserves, cardano: cardanoReserves, solana: solanaReserves };

/** Reads all lockers and prices them. A failed chain is reported, never silently zeroed. */
export async function snapshotReserves(getPrice: GetPrice = createPricer(), collectors = COLLECTORS): Promise<ReserveSnapshot> {
  const ts = Date.now();
  const chains = Object.keys(collectors) as Chain[];
  const results = await Promise.allSettled(chains.map(c => collectors[c]()));
  const failedChains = chains.filter((_, i) => results[i].status === 'rejected');
  const reserves = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  return { ts, failedChains, ...(await valueReserves(reserves, getPrice)) };
}
