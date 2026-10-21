export type Confidence = 'Exact' | 'Partial' | 'Stale';

export function reserveRatio(reservesUsd: number, liabilitiesUsd: number): number | undefined {
  if (!(liabilitiesUsd > 0)) return undefined;
  return reservesUsd / liabilitiesUsd;
}

export function confidence(listed: number, read: number, ageMs: number): { label: Confidence; failed: number } {
  if (ageMs > 10 * 60_000) return { label: 'Stale', failed: listed - read };
  return read >= listed ? { label: 'Exact', failed: 0 } : { label: 'Partial', failed: listed - read };
}

export function usdValue(amount: number, price: number): number {
  return Math.round(amount * price * 100) / 100;
}

export { flowMatch } from './flowMatch';
