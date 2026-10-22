export type Confidence = 'Exact' | 'Partial' | 'Stale';
export type RatioStatus = 'Balanced' | 'Drift' | 'Needs review';

export function reserveRatio(reservesUsd: number, liabilitiesUsd: number): number | undefined {
  if (!(liabilitiesUsd > 0)) return undefined;
  return reservesUsd / liabilitiesUsd;
}

/**
 * Strike is not a CEX: reserves must equal liabilities, so the target is exactly 100.00%.
 * Over 100% is as suspicious as under (missed account, double count, wrong price).
 * ≤ 0.01% off → Balanced; ≤ 1% → Drift; > 1% → Needs review (never published or alerted as insolvency).
 */
export function ratioStatus(ratio: number | undefined): RatioStatus | undefined {
  if (ratio === undefined) return undefined;
  const dev = Math.abs(ratio - 1);
  // Small epsilon so exact band edges (e.g. 1.0001) don't flip on float rounding.
  if (dev <= 0.0001 + 1e-12) return 'Balanced';
  if (dev <= 0.01 + 1e-12) return 'Drift';
  return 'Needs review';
}

export type Assessment = {
  ratio?: number; status?: RatioStatus | 'Incomplete' | 'In transit'; explainedBy?: string;
  /** reserves − liabilities (USD) and as % of liabilities, e.g. −12 / −0.0004. */
  gapUsd?: number; gapPct?: number;
};

/** Known in-transit amounts (founder, 22 Oct): ETH LP withdrawal + Cardano↔Ethereum IOG bridge. A gap this size is not Drift. */
export const IN_TRANSIT = {
  toleranceUsd: Number(process.env.IN_TRANSIT_TOLERANCE_USD ?? 10_000),
  note: 'Known in-transit: a large LP withdrawal on Ethereum and Cardano USDCx deposits / USDC withdrawals being bridged back through the IOG bridge (per Strike). The missing amount is not added or faked.',
};

/**
 * Band the ratio, but don't call a gap Drift / Needs review when something known explains it:
 * - |gap| within the founder-stated in-transit amount → 'In transit' (shown as a note, never an alert);
 * - a shortfall while some reserves are still unpriced → 'Incomplete';
 * - a surplus no larger than an estimate of liabilities Strike does not expose yet → 'Incomplete'.
 */
export function assessRatio(p: { reservesUsd: number; liabilitiesUsd: number; unpricedReserves: number; pendingLiabilityEstimateUsd: number; inTransitToleranceUsd?: number }): Assessment {
  const ratio = reserveRatio(p.reservesUsd, p.liabilitiesUsd);
  const status = ratioStatus(ratio);
  const gapUsd = p.reservesUsd - p.liabilitiesUsd;
  const base = { ratio, gapUsd, gapPct: p.liabilitiesUsd > 0 ? (gapUsd / p.liabilitiesUsd) * 100 : undefined };
  if (ratio === undefined || status === 'Balanced') return { ...base, status };
  const tol = p.inTransitToleranceUsd ?? IN_TRANSIT.toleranceUsd;
  if (Math.abs(gapUsd) <= tol) return { ...base, status: 'In transit', explainedBy: `known in-transit funds (≤ $${tol.toLocaleString('en-US')})` };
  if (ratio < 1 && p.unpricedReserves > 0) return { ...base, status: 'Incomplete', explainedBy: `${p.unpricedReserves} unpriced reserve asset(s)` };
  if (ratio > 1 && gapUsd <= p.pendingLiabilityEstimateUsd) return { ...base, status: 'Incomplete', explainedBy: `pending liabilities (~$${p.pendingLiabilityEstimateUsd.toLocaleString('en-US')})` };
  return { ...base, status };
}

/** "Gap $12 · −0.0004%" */
export function formatGap(a: Assessment): string {
  if (a.gapUsd === undefined || a.gapPct === undefined) return 'Gap n/a';
  const sign = a.gapUsd < 0 ? '−' : '+';
  return `Gap ${sign}$${Math.abs(a.gapUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })} · ${sign}${Math.abs(a.gapPct).toFixed(4)}%`;
}

export function confidence(listed: number, read: number, ageMs: number): { label: Confidence; failed: number } {
  if (ageMs > 10 * 60_000) return { label: 'Stale', failed: listed - read };
  return read >= listed ? { label: 'Exact', failed: 0 } : { label: 'Partial', failed: listed - read };
}

export function usdValue(amount: number, price: number): number {
  return Math.round(amount * price * 100) / 100;
}

export { flowMatch } from './flowMatch';
