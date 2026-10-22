// Public, read-only views of the engine state. Shared by the Node server and the published snapshot (Vercel).
import { LOCKERS, EXPLORERS } from '../../packages/core/config';
import type { State } from './engine';

export function publicConfig(e: NodeJS.ProcessEnv = process.env) {
  return {
    strikeApi: e.STRIKE_API ?? 'https://api.strikefinance.org',
    strikeTestnetApi: e.STRIKE_TESTNET_API ?? 'https://api-v2-testnet.strikefinance.org',
    builderCode: e.STRIKE_BUILDER_CODE || null,
    builderFeeBps: Number(e.STRIKE_BUILDER_FEE_BPS ?? 0),
    telegramChannel: e.TELEGRAM_CHANNEL_URL || null,
    github: 'https://github.com/Lakshmikanth-3/ZeroGap',
    lockers: {
      ethereum: { address: LOCKERS.ethereum, url: EXPLORERS.ethereum(LOCKERS.ethereum) },
      solana: { address: LOCKERS.solana, url: EXPLORERS.solana(LOCKERS.solana) },
      cardano: LOCKERS.cardano.map(a => ({ address: a, url: EXPLORERS.cardano(a) })),
    },
  };
}

/** Everything a page needs, each block with its own timestamp and last error (if any). */
export function snapshot(s: State) {
  return {
    now: Date.now(), startedAt: s.startedAt,
    reserves: s.reserves && {
      ts: s.reserves.ts, pricedUsd: s.reserves.value.pricedUsd, stalePrices: s.reserves.value.stalePrices,
      rows: s.reserves.value.rows.map(r => ({ chain: r.chain, holder: r.holder, asset: r.asset, contract: r.contract, amount: r.amount, usdValue: r.usdValue, price: r.quote })),
      unpriced: s.reserves.value.unpriced.map(r => ({ chain: r.chain, asset: r.asset, amount: r.amount, source: r.quote.source })),
    },
    liabilities: s.liabilities && (({ failed, negative, accounts, vaults, ...rest }) => ({ ...rest, failedCount: failed.length, negativeCount: negative.length }))({ ...s.liabilities.value, ts: s.liabilities.ts }),
    report: s.report,
    ratio: s.ratio && { ...s.ratio.value, ts: s.ratio.ts },
    safety: s.safety && s.safety.value,
    solanaSafety: s.solanaSafety && { ...s.solanaSafety.value, ts: s.solanaSafety.ts },
    events: s.events.slice(-50).reverse(),
    flows: s.flows && { ...s.flows.value, ts: s.flows.ts },
    feed: s.feed.slice(0, 30),
    alerts: s.alerts.slice(0, 30),
    errors: s.errors,
  };
}
