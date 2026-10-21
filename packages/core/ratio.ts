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

export function confidence(listed: number, read: number, ageMs: number): { label: Confidence; failed: number } {
  if (ageMs > 10 * 60_000) return { label: 'Stale', failed: listed - read };
  return read >= listed ? { label: 'Exact', failed: 0 } : { label: 'Partial', failed: listed - read };
}

export function usdValue(amount: number, price: number): number {
  return Math.round(amount * price * 100) / 100;
}

export { flowMatch } from './flowMatch';
