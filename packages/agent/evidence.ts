// Gap Investigator, deterministic layer. Every number here is computed in code from the verified scan report (and the
// previous one); the model never does arithmetic. Two ledgers:
//   gap    — causes of the CURRENT gap (reserves − liabilities). Only confirmed / supported causes are attributed;
//            unexplained_usd = gap − Σ attributed, whatever sign it ends up with (never forced to zero).
//   change — what moved between the previous scan and this one. Reconciles exactly by construction
//            (per reserve row: price effect a₀·(p₁−p₀), quantity effect = the rest; liabilities per component).
import type { ScanReport } from '../core/report';

export type EvidenceType = 'sql' | 'tx' | 'source';
export type Evidence = { id: string; type: EvidenceType; value: string; label: string; url?: string };
export type CauseStatus = 'confirmed' | 'supported' | 'hypothesis' | 'rejected' | 'unresolved';
export type Cause = {
  id: string; key: string; cause: string; scope: 'gap' | 'change'; status: CauseStatus;
  /** Signed like the gap (reserves − liabilities): the part of the gap (or of its change) this cause accounts for. null = not quantifiable. */
  usd: number | null; attributed: boolean; confidence: 'high' | 'medium' | 'low';
  calculation?: string; explanation: string; evidence: Evidence[];
};
export type LockerEvent = { chain: string; type: string; usd: number; tx: string; ts: number; url?: string };
export type HistoryPoint = { scan_id: string; ts: string; gap_usd: number | null; status: string | null };

export const CONFIDENCE: Record<CauseStatus, Cause['confidence']> = { confirmed: 'high', supported: 'medium', hypothesis: 'low', rejected: 'high', unresolved: 'low' };
export const RELAYER = '0x8f0eb9cacd6f35e2afb64f137fd1ba797fa1eca7';
const ETHERSCAN = 'https://etherscan.io';

export const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Evidence ids are issued here and only here; the model can cite them but never mint them. */
export class EvidenceBook {
  private n = 0;
  readonly all = new Map<string, Evidence>();
  add(type: EvidenceType, value: string, label: string, url?: string): Evidence {
    const e: Evidence = { id: `E${++this.n}`, type, value, label, ...(url ? { url } : {}) };
    this.all.set(e.id, e);
    return e;
  }
}

/** A pointer into the hashed report: anyone can open the JSON and read the same value. */
const field = (book: EvidenceBook, r: ScanReport, path: string, value: unknown, label: string) =>
  book.add('source', `report ${r.content_sha256.slice(0, 16)} · ${path} = ${typeof value === 'number' ? r2(value) : JSON.stringify(value)}`, label);

export type GapInput = {
  report: ScanReport; previous?: ScanReport;
  /** Locker deposits/withdrawals seen on-chain (tool lookups); used for the scan-window and between-scans tests. */
  lockerEvents?: LockerEvent[]; lockerEventsSource?: Evidence | string;
  /** Earliest timestamp the locker events cover (default: all of them). */
  lockerEventsFrom?: number;
  history?: { points: HistoryPoint[]; evidence: { type: EvidenceType; value: string; label: string } };
};

export type GapAnalysis = {
  gap_usd: number; gap_pct: number | null; causes: Cause[]; unexplained_usd: number;
  change: null | { from_scan: string; from_ts: string; gap_before: number; gap_after: number; delta_usd: number; remainder_usd: number; components: { label: string; usd: number }[] };
  history: null | { scans: number; same_sign: number; first_ts: string; persistent: boolean };
  warnings: string[]; book: EvidenceBook;
};

export function analyzeGap(inp: GapInput, book = new EvidenceBook()): GapAnalysis {
  const r = inp.report;
  const L = r.liabilities;
  const gap = r.result.gap_usd ?? r.reserves.priced_usd - L.total_usd;
  const sign = gap < 0 ? -1 : 1;
  const causes: Cause[] = [];
  const warnings: string[] = [];
  let cid = 0;
  const push = (c: Omit<Cause, 'id' | 'confidence'> & { confidence?: Cause['confidence'] }) => causes.push({ id: `C${++cid}`, confidence: CONFIDENCE[c.status], ...c });
  field(book, r, 'result.gap_usd', gap, 'Gap = priced reserves − liabilities');

  // --- Data completeness (unresolved items are never folded into the numbers) ---
  if (L.accounts_failed.length) push({ key: 'partial_scan', cause: `${L.accounts_failed.length} account(s) could not be read`, scope: 'gap', status: 'unresolved', usd: null, attributed: false, explanation: 'Liabilities are understated by whatever these accounts hold; the gap cannot be fully explained until they are read.', evidence: [field(book, r, 'liabilities.accounts_failed', L.accounts_failed.length, 'Accounts that failed to read')] });
  for (const u of r.reserves.unpriced) push({ key: 'unpriced_reserve', cause: `${u.asset} on ${u.chain} has no price and is left out of reserves`, scope: 'gap', status: 'unresolved', usd: null, attributed: false, explanation: 'An unpriced asset understates reserves by an unknown amount.', evidence: [field(book, r, 'reserves.unpriced', u, `Unpriced ${u.asset}`)] });
  for (const x of r.reserves.rows.filter(x => x.price_status === 'placeholder')) push({ key: 'placeholder_price', cause: `${x.asset} is counted at a placeholder price`, scope: 'gap', status: 'unresolved', usd: x.usd_value === null ? null : -x.usd_value, attributed: false, calculation: `${x.amount} × placeholder ${x.price_usd} = ${usd(x.usd_value ?? 0)}`, explanation: `Reserves include ${usd(x.usd_value ?? 0)} of ${x.asset} at a price Strike has not confirmed; if it is worth less, the gap is wider by up to that amount.`, evidence: [field(book, r, `reserves.rows[${x.asset}].price_source`, x.price_source, `${x.asset} price source`)] });
  if (r.reserves.failed_chains.length) warnings.push(`Reserve collectors failed: ${r.reserves.failed_chains.join(', ')}`);
  if (r.reserves.stale_prices) warnings.push('Some prices were stale at snapshot time');
  if (L.confidence !== 'Exact') warnings.push(`Liability scan confidence: ${L.confidence}`);

  // --- H: vault accounts hold more than their depositors' shares (confirmed arithmetic) ---
  const vc = r.result.vault_crosscheck;
  push({
    key: 'vault_crosscheck', cause: 'Vault accounts hold more (or less) than the sum of their depositors\' shares', scope: 'gap', status: 'confirmed',
    usd: r2(vc.difference_usd), attributed: true,
    calculation: `Σ vault account equity ${usd(vc.vault_accounts_usd)} − Σ depositor shares ${usd(vc.depositor_shares_usd)} = ${r2(vc.difference_usd)}`,
    explanation: 'Vault money sits in the lockers (reserves) but only depositors\' shares are counted as owed, so the difference shows up one-for-one in the gap.',
    evidence: [field(book, r, 'result.vault_crosscheck.difference_usd', vc.difference_usd, 'Vault cross-check difference')],
  });

  // --- H: isolated margin missing from balances (tested: is it counted?) ---
  push({
    key: 'isolated_margin', cause: 'Isolated margin missing from liabilities', scope: 'gap', status: 'rejected', usd: 0, attributed: false,
    calculation: `account equity ${usd(L.account_equity_usd)} − Σ margin_balance ${usd(L.margin_balance_usd)} = ${usd(L.isolated_margin_usd)} isolated margin, already inside equity`,
    explanation: `Liabilities use wallet_balance + unrealized_pnl, which already contains the ${usd(L.isolated_margin_usd)} held in isolated-margin positions, so nothing is missing (this was the cause of the earlier $77K swing, fixed 23 Oct).`,
    evidence: [field(book, r, 'liabilities.isolated_margin_usd', L.isolated_margin_usd, 'Isolated margin (inside equity)'), book.add('source', 'docs/DECISIONS.md #50 · docs/GAP-INVESTIGATION.md check 1', 'Formula decision: equity, not margin_balance')],
  });

  // --- H: relayed deposits (Solana and other chains via relayer) ---
  const eth = r.sources.lockers as { ethereum?: string };
  push({
    key: 'relayed_deposits', cause: 'Relayed deposits not counted in reserves', scope: 'gap', status: 'rejected', usd: 0, attributed: false,
    explanation: 'Deposits from chains without their own locker arrive as USDC in the Ethereum locker via Strike\'s relayer, and the Ethereum locker balance is counted in reserves. They affect the per-chain flow match, not the ratio.',
    evidence: [book.add('source', `relayer ${RELAYER} → Ethereum locker ${eth.ethereum ?? ''}`, 'Relayer path (docs/DECISIONS.md #53)', `${ETHERSCAN}/address/${RELAYER}`)],
  });

  // --- H: commission not yet exposed ---
  push({
    key: 'commission_pending', cause: 'Commission balances not yet exposed by Strike', scope: 'gap', status: gap < 0 ? 'rejected' : 'hypothesis', usd: null, attributed: false,
    explanation: gap < 0 ? 'Commission is owed to users, so adding it would widen a shortfall; it cannot explain one.' : 'Commission is owed to users and not yet counted; it could absorb part of this surplus once Strike exposes it.',
    evidence: [field(book, r, 'liabilities.commission_usd', L.commission_usd, 'Commission line (pending)')],
  });

  // --- H: open trader profit vs the market-maker bot (counterparty) ---
  const upnl = L.accounts.reduce((s, a) => s + Number(a.unrealized_pnl), 0);
  const hedge = r.reserves.rows.filter(x => x.chain === 'hedge').reduce((s, x) => s + (x.usd_value ?? 0), 0);
  const unbacked = upnl - hedge;
  push({
    key: 'mm_bot_counterparty', cause: 'Open trader profit whose losing side sits outside the lockers', scope: 'gap',
    status: hedge > 0 ? 'hypothesis' : 'unresolved', usd: unbacked > 0 ? r2(-unbacked) : 0, attributed: false,
    calculation: `Σ unrealized_pnl ${usd(upnl)} − market-maker bot equity ${usd(hedge)} = ${usd(unbacked)}`,
    explanation: `Users are owed ${usd(upnl)} of net open profit. The other side of their trades is Strike's market-maker bot on external exchanges, counted as a reserve line of ${usd(hedge)}. ${unbacked > 0 ? `The ${usd(unbacked)} not matched by the bot is a candidate, not a confirmed cause.` : 'The bot covers it.'}`,
    evidence: [book.add('source', `report ${r.content_sha256.slice(0, 16)} · Σ liabilities.accounts[].unrealized_pnl = ${r2(upnl)}`, 'Net unrealized PnL owed to users'), field(book, r, 'reserves.rows[chain=hedge].usd_value', r2(hedge), 'Market-maker bot equity (Lighter + Aster)')],
  });

  // --- H: staking rewards backed outside the perps lockers ---
  push({
    key: 'staking_backing', cause: 'Staking rewards funded from a wallet outside the lockers', scope: 'gap', status: gap < 0 ? 'hypothesis' : 'rejected', usd: gap < 0 ? r2(-L.staking_rewards_usd) : 0, attributed: false,
    calculation: `Σ stakingRewardBalance = ${usd(L.staking_rewards_usd)} counted as owed`,
    explanation: gap < 0 ? `Staking rewards (${usd(L.staking_rewards_usd)}) are counted as owed. If they are paid from a treasury that is not one of the lockers, that wallet belongs in reserves. Open question with Strike.` : 'Adding a staking treasury would raise reserves and widen a surplus, so it cannot explain one.',
    evidence: [field(book, r, 'liabilities.staking_rewards_usd', L.staking_rewards_usd, 'Staking rewards owed')],
  });

  // --- H: funds in transit over a bridge (Strike-stated tolerance) ---
  const tol = r.result.in_transit.tolerance_usd;
  const within = Math.abs(gap) <= tol;
  push({
    key: 'bridge_in_transit', cause: 'Funds in transit over the Cardano↔Ethereum bridge or an LP withdrawal', scope: 'gap',
    status: within ? 'supported' : 'hypothesis', usd: r2(sign * Math.min(Math.abs(gap), tol)), attributed: within,
    calculation: `|gap| ${usd(Math.abs(gap))} ${within ? '≤' : '>'} stated in-transit amount ${usd(tol)}`,
    explanation: within ? 'The whole gap fits inside the amount Strike says is in transit; the transfers themselves are not yet matched on-chain.' : `Strike says up to ${usd(tol)} is in transit; that is less than the gap, and it is not yet matched on-chain, so it is not attributed.`,
    evidence: [field(book, r, 'result.in_transit.tolerance_usd', tol, 'In-transit amount stated by Strike')],
  });

  // --- H: deposits/withdrawals landing while the scan ran (timing) ---
  const t0 = Date.parse(r.timing.liability_scan.started_at), t1 = Date.parse(r.timing.reserves_read_at);
  if (inp.lockerEvents) {
    const inWin = inp.lockerEvents.filter(e => e.ts >= t0 && e.ts <= t1);
    const net = inWin.reduce((s, e) => s + e.usd, 0);
    push({
      key: 'scan_window_flows', cause: 'Deposits or withdrawals during the 3-minute scan window', scope: 'gap',
      status: inWin.length ? 'supported' : 'rejected', usd: r2(net), attributed: inWin.length > 0,
      calculation: inWin.length ? `Σ locker flows between ${r.timing.liability_scan.started_at} and ${r.timing.reserves_read_at} = ${usd(net)} (upper bound: some accounts were read after the flow)` : 'no locker deposit or withdrawal in the scan window',
      explanation: inWin.length ? 'Accounts are read over ~3 minutes and lockers right after; money that moved in between is on one side only.' : 'Nothing moved through the Ethereum locker while the scan ran, so timing does not explain the gap.',
      evidence: inWin.length ? inWin.map(e => book.add('tx', e.tx, `${e.chain} ${e.type} ${usd(e.usd)}`, e.url)) : [typeof inp.lockerEventsSource === 'string' ? book.add('source', inp.lockerEventsSource, 'Locker events checked') : inp.lockerEventsSource ?? book.add('source', 'no events', 'Locker events checked')],
    });
  }

  // --- History: is the gap new or persistent? ---
  let history: GapAnalysis['history'] = null;
  if (inp.history?.points.length) {
    const pts = inp.history.points.filter(p => p.gap_usd !== null);
    const same = pts.filter(p => Math.sign(p.gap_usd!) === Math.sign(gap)).length;
    history = { scans: pts.length, same_sign: same, first_ts: pts.map(p => p.ts).sort()[0], persistent: pts.length >= 3 && same / pts.length >= 0.8 };
    book.add(inp.history.evidence.type, inp.history.evidence.value, inp.history.evidence.label);
  }

  // --- Change since the previous scan (exact decomposition) ---
  let change: GapAnalysis['change'] = null;
  if (inp.previous) change = decomposeChange(inp.previous, r, inp.lockerEvents && (inp.lockerEventsFrom ?? 0) <= Date.parse(inp.previous.timing.reserves_read_at) ? inp.lockerEvents : undefined, (c) => push(c), book);

  const attributed = causes.filter(c => c.scope === 'gap' && c.attributed && c.usd !== null).reduce((s, c) => s + c.usd!, 0);
  return { gap_usd: gap, gap_pct: r.result.gap_pct, causes, unexplained_usd: r2(gap - attributed), change, history, warnings, book };
}

const rowKey = (x: ScanReport['reserves']['rows'][number]) => `${x.chain}|${x.address}|${x.asset}`;

function decomposeChange(prev: ScanReport, cur: ScanReport, events: LockerEvent[] | undefined, push: (c: Omit<Cause, 'id' | 'confidence'>) => void, book: EvidenceBook): NonNullable<GapAnalysis['change']> {
  const g0 = prev.result.gap_usd ?? prev.reserves.priced_usd - prev.liabilities.total_usd;
  const g1 = cur.result.gap_usd ?? cur.reserves.priced_usd - cur.liabilities.total_usd;
  const a = new Map(prev.reserves.rows.map(x => [rowKey(x), x]));
  const b = new Map(cur.reserves.rows.map(x => [rowKey(x), x]));
  let price = 0;
  const priceByAsset = new Map<string, number>();
  const qtyByRow: { key: string; chain: string; asset: string; address: string | null; usd: number }[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x0 = a.get(k), x1 = b.get(k);
    const v0 = x0?.usd_value ?? 0, v1 = x1?.usd_value ?? 0;
    const pe = x0 && x1 && x0.price_usd !== null && x1.price_usd !== null ? x0.amount * (x1.price_usd - x0.price_usd) : 0;
    price += pe;
    if (pe) priceByAsset.set((x1 ?? x0)!.asset, (priceByAsset.get((x1 ?? x0)!.asset) ?? 0) + pe);
    const x = (x1 ?? x0)!;
    qtyByRow.push({ key: k, chain: x.chain, asset: x.asset, address: x.address, usd: v1 - v0 - pe });
  }
  const qty = qtyByRow.reduce((s, q) => s + q.usd, 0);
  const lp = prev.liabilities, lc = cur.liabilities;
  const dEq = -(lc.account_equity_usd - lp.account_equity_usd), dVs = -(lc.vault_shares_usd - lp.vault_shares_usd), dSt = -(lc.staking_rewards_usd - lp.staking_rewards_usd);
  const dResOther = (cur.reserves.priced_usd - prev.reserves.priced_usd) - (price + qty); // rounding of priced totals
  const dLiabOther = -((lc.total_usd - lp.total_usd)) - (dEq + dVs + dSt);
  const components = [
    { label: 'Price moves on reserve assets', usd: r2(price) },
    { label: 'Locker balance changes (quantity)', usd: r2(qty) },
    { label: 'Account equity owed to users', usd: r2(dEq) },
    { label: 'Vault shares owed to depositors', usd: r2(dVs) },
    { label: 'Staking rewards owed', usd: r2(dSt) },
  ];
  const from = prev.content_sha256.slice(0, 16);
  const eDelta = book.add('source', `report ${from} → report ${cur.content_sha256.slice(0, 16)} · gap ${r2(g0)} → ${r2(g1)}`, 'Gap in the previous and current scan');

  const topPrice = [...priceByAsset].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  push({
    key: 'price_movement', cause: 'Price movement between scans', scope: 'change', status: Math.abs(price) >= 1 ? 'confirmed' : 'rejected', usd: r2(price), attributed: true,
    calculation: `Σ previous amount × (price now − price then) = ${usd(price)}${topPrice ? `; largest ${topPrice[0]} ${usd(topPrice[1])}` : ''}`,
    explanation: Math.abs(price) >= 1 ? `Prices of ETH/SOL/ADA and priced collateral moved between ${prev.timing.price_snapshot_at} and ${cur.timing.price_snapshot_at}, changing reserves by ${usd(price)} while what users are owed is in dollars.` : 'Prices did not move enough to matter.',
    evidence: [eDelta, ...[...priceByAsset].filter(([, v]) => Math.abs(v) >= 1).slice(0, 4).map(([asset]) => {
      const p0 = prev.reserves.rows.find(x => x.asset === asset)!, p1 = cur.reserves.rows.find(x => x.asset === asset)!;
      return book.add('source', `${asset} price ${p0.price_usd} → ${p1.price_usd} (${p1.price_source})`, `${asset} price change`);
    })],
  });
  const big = qtyByRow.filter(q => Math.abs(q.usd) >= 1).sort((x, y) => Math.abs(y.usd) - Math.abs(x.usd));
  const top = big[0];
  if (top) push({
    key: 'locker_change', cause: `Single locker balance change: ${top.asset} on ${top.chain}`, scope: 'change', status: 'confirmed', usd: r2(top.usd), attributed: true,
    calculation: `(amount now − amount then) × price now for ${top.asset} at ${top.address ?? top.chain} = ${usd(top.usd)}; ${big.length - 1} other row(s) moved ${usd(qty - top.usd)}`,
    explanation: `The largest quantity change was ${top.asset} on ${top.chain} (${usd(top.usd)}).`,
    evidence: [book.add('source', `locker ${top.address ?? top.chain} · ${top.asset}: ${a.get(top.key)?.amount ?? 0} → ${b.get(top.key)?.amount ?? 0}`, `${top.asset} locker balance`, explorerFor(top.chain, top.address))],
  });
  if (events) {
    const t0 = Date.parse(prev.timing.reserves_read_at), t1 = Date.parse(cur.timing.reserves_read_at);
    const between = events.filter(e => e.ts > t0 && e.ts <= t1 && e.usd < 0);
    const largest = between.sort((x, y) => x.usd - y.usd)[0];
    push({
      key: 'large_withdrawal', cause: 'A large withdrawal between scans', scope: 'change', status: largest ? 'supported' : 'rejected', usd: largest ? r2(largest.usd) : 0, attributed: false,
      calculation: largest ? `largest of ${between.length} Ethereum locker withdrawal(s): ${usd(largest.usd)}` : 'no Ethereum locker withdrawal between the two reserve reads',
      explanation: largest ? 'A withdrawal lowers reserves and the account it came from at the same time; it only moves the gap if the account side was read before it. Shown for context, not attributed.' : 'No withdrawal moved money out of the Ethereum locker between the scans.',
      evidence: largest ? [book.add('tx', largest.tx, `${largest.type} ${usd(largest.usd)}`, largest.url)] : [eDelta],
    });
  }
  if (Math.abs(dResOther) > 1 || Math.abs(dLiabOther) > 1) components.push({ label: 'Rounding of published totals', usd: r2(dResOther + dLiabOther) });
  const remainder = r2(g1 - g0 - components.reduce((s, c) => s + c.usd, 0));
  return { from_scan: from, from_ts: prev.timing.price_snapshot_at ?? prev.generated_at, gap_before: r2(g0), gap_after: r2(g1), delta_usd: r2(g1 - g0), remainder_usd: remainder, components };
}

function explorerFor(chain: string, address: string | null): string | undefined {
  if (!address) return undefined;
  if (chain === 'ethereum') return `${ETHERSCAN}/address/${address}`;
  if (chain === 'solana') return `https://solscan.io/account/${address}`;
  if (chain === 'cardano') return `https://cardanoscan.io/address/${address}`;
  return undefined;
}
