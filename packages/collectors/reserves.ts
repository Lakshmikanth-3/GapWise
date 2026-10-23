import { ethReserves } from './ethereum';
import { cardanoReserves } from './cardano';
import { solanaReserves } from './solana';
import { hedgeReserves } from './hedge';
import { createPricer, creditCustodyMappings, applyCustodyScale, type CustodyMappings, type GetPrice } from './prices';
import { valueReserves } from '../core/valuation';
import type { Chain, Reserve } from './types';

export type ReserveSnapshot = Awaited<ReturnType<typeof valueReserves<Reserve>>> & {
  ts: number; failedChains: Chain[];
  /** Whether raw amounts were re-scaled with Strike's live custody mappings (else the collectors' own decimals stand). */
  custodyScale: { applied: boolean; error?: string };
};

const COLLECTORS: Partial<Record<Chain, () => Promise<Reserve[]>>> = { ethereum: ethReserves, cardano: cardanoReserves, solana: solanaReserves, hedge: () => hedgeReserves() };

/** Reads all lockers and prices them. A failed chain is reported, never silently zeroed. */
export async function snapshotReserves(
  getPrice: GetPrice = createPricer(), collectors = COLLECTORS,
  custody: () => Promise<CustodyMappings> = () => creditCustodyMappings(),
): Promise<ReserveSnapshot> {
  const ts = Date.now();
  const chains = Object.keys(collectors) as Chain[];
  const [results, mappings] = await Promise.all([
    Promise.allSettled(chains.map(c => collectors[c]!())),
    custody().then(m => ({ m }), e => ({ error: (e as Error).message })),
  ]);
  const failedChains = chains.filter((_, i) => results[i].status === 'rejected');
  let reserves = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  let custodyScale: ReserveSnapshot['custodyScale'];
  if ('m' in mappings) { reserves = applyCustodyScale(reserves, mappings.m); custodyScale = { applied: true }; }
  else custodyScale = { applied: false, error: mappings.error };
  return { ts, failedChains, custodyScale, ...(await valueReserves(reserves, getPrice)) };
}
