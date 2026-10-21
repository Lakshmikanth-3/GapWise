export function flowMatch(reported: number, onchain: number, tolerance = 0.01) {
  if (reported === 0 && onchain === 0) return { matchPct: 100, mismatch: false };
  const base = Math.max(Math.abs(reported), Math.abs(onchain));
  const diff = Math.abs(reported - onchain) / base;
  return { matchPct: Math.round((1 - diff) * 10000) / 100, mismatch: diff > tolerance };
}
