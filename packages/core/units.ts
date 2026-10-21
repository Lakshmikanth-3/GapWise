/** Exact base-unit ↔ decimal-string conversion with BigInt (no float rounding). */
export const DECIMALS = { ADA: 6, ETH: 18, SOL: 9 } as const;

export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ''] = amount.trim().split('.');
  if (!/^-?\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new Error(`invalid amount ${amount}`);
  if (frac.length > decimals) throw new Error(`${amount} has more than ${decimals} decimals`);
  const neg = whole.startsWith('-');
  const units = BigInt(whole.replace('-', '')) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return neg ? -units : units;
}

export function fromBaseUnits(units: bigint, decimals: number): string {
  const neg = units < 0n; const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${abs / base}${frac ? `.${frac}` : ''}`;
}
