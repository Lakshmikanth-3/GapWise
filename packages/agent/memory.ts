// Agent memory on Meterless H-MEM (vendored reference implementation in ./hmem, JSON-persisted under data/hmem).
// Seeded once with findings already confirmed in docs/GAP-INVESTIGATION.md and docs/DECISIONS.md; every finished
// investigation is saved, so the next one starts from what was learned (recall happens before investigating).
import { HMEM } from './hmem/index.ts';

export type Recalled = { id: string; content: string; source: string; relevance: number };

/** Past confirmed findings. Each carries the document it came from; nothing here is invented for the demo. */
export const SEED: { content: string; source: string; tags: string[] }[] = [
  { content: 'Isolated margin: on 23 Oct the gap swung by about $71K-77K because liabilities used margin_balance, which leaves out isolated-margin positions (46 accounts, $76.4K). Fixed by counting wallet_balance + unrealized_pnl. Isolated margin is now inside account equity.', source: 'docs/GAP-INVESTIGATION.md#check-1 · docs/DECISIONS.md #50', tags: ['isolated_margin', 'formula'] },
  { content: 'Relayed deposits: deposits from chains without their own locker (Solana via relayer, base, bsc, polygon, arbitrum, optimism, hyperevm, bitcoin, tron) arrive as USDC in the Ethereum locker from relayer 0x8f0eb9cacd6f35e2afb64f137fd1ba797fa1eca7. They affect the per-chain flow match, not the reserve ratio. The 18-21 Oct flow false alarms came from this.', source: 'docs/DECISIONS.md #53', tags: ['relayed_deposits', 'flows'] },
  { content: 'Market-maker bot: Strike\'s bot 0x6139192a58152932e6f8052ef0de2ad197fb1937 holds the other side of traders\' positions on Lighter and Aster. Its equity is a separate, disclosed reserve line. It deposits into the Ethereum locker for Strike account 019d06a7-bcfb-79a9-857e-cd54172ba144.', source: 'docs/DECISIONS.md #52, #54', tags: ['mm_bot_counterparty', 'hedge'] },
  { content: 'The -$63K gap on 23 Oct was almost exactly net unrealized trader profit (+$33.7K, losing side not on the leaderboard) plus staking rewards ($32.0K). Open questions: where the counterparty of open profit sits and which wallet backs staking rewards.', source: 'docs/GAP-INVESTIGATION.md#what-the-gap-is-made-of', tags: ['staking_backing', 'mm_bot_counterparty'] },
  { content: 'Strike stated known in-transit funds: a large LP withdrawal on Ethereum and Cardano USDCx deposits / USDC withdrawals bridged back through the IOG bridge. The engine tolerates up to $10,000 as "In transit"; the transfers are not yet matched on-chain.', source: 'packages/core/ratio.ts IN_TRANSIT · docs/DECISIONS.md #54', tags: ['bridge_in_transit'] },
  { content: 'Commission balances are withdrawable liabilities but Strike does not expose them yet; they are a pending line with no value. Adding them can only widen a shortfall.', source: 'packages/core/liabilities.ts · docs/DECISIONS.md', tags: ['commission_pending'] },
  { content: 'iUSD on Cardano (about $5.7K) is counted at a placeholder price of $1 until Strike confirms a price source.', source: 'docs/DECISIONS.md #51', tags: ['placeholder_price'] },
];

export class GapMemory {
  readonly hmem: HMEM;
  constructor(dir = process.env.GAPWISE_MEMORY_DIR ?? 'data/hmem', clock?: () => number) {
    this.hmem = new HMEM({ persistDir: dir, actor: 'gapwise', clock });
    if (!this.hmem.store.all().some(m => m.tags.includes('seed'))) {
      for (const s of SEED) this.hmem.add({ content: s.content, type: 'factual', layer: 'long_term', tags: ['seed', ...s.tags], confidence: 0.9, source: s.source, provenance: { origin: 'document', learnedAt: this.hmem.clock(), label: s.source } });
    }
  }

  recall(query: string, topN = 4): Recalled[] {
    return this.hmem.query(query, { topN, threshold: 0.05 }).memories.map(m => ({ id: m.memory.id, content: m.memory.content, source: m.memory.source, relevance: Math.round(m.relevance * 1000) / 1000 }));
  }

  save(p: { investigationId: string; verdict: string; causes: { key: string; status: string }[] }): string {
    const rec = this.hmem.add({
      content: p.verdict, type: 'factual', layer: 'working', confidence: 0.7,
      tags: ['investigation', ...p.causes.filter(c => c.status === 'confirmed' || c.status === 'supported').map(c => c.key)],
      source: `gapwise:investigation:${p.investigationId}`,
      provenance: { origin: 'model_response', learnedAt: this.hmem.clock(), label: p.investigationId },
    });
    return rec.id;
  }
}
