// Gap audit (DECISIONS #51): raw per-account fields for every leaderboard account, sub-account and vault account.
// Usage: node scripts/gap-audit.mjs out.json   (public API only, no keys; ~4 min)
import { writeFileSync } from 'node:fs';
const B = 'https://api.strikefinance.org', OUT = process.argv[2];
const j = async (u) => { for (let i = 0; i < 6; i++) { const r = await fetch(u); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 400 * (i + 1))); } throw new Error(u); };
const lb = await j(`${B}/stat/v1/stats/leaderboard`);
const lbById = Object.fromEntries(lb.entries.map((e) => [e.account_id, e]));
const queue = lb.entries.filter((e) => !e.vault_id && !e.account_id.startsWith('vault_')).map((e) => ({ id: e.account_id, sub: false, parent: null }));
const seen = new Set(queue.map((q) => q.id));
const rows = [];
async function worker() {
  while (queue.length) {
    const q = queue.shift();
    try {
      const [a, bal] = await Promise.all([j(`${B}/v2/account?account_id=${q.id}`), j(`${B}/v2/balances?account_id=${q.id}`)]);
      const b = Array.isArray(bal) ? bal : [];
      rows.push({ id: q.id, sub: q.sub, parent: q.parent, kind: 'account',
        wallet: +a.wallet_balance, upnl: +(a.unrealized_pnl ?? 0), margin: +a.margin_balance, available: +a.available_balance,
        total_margin: +(a.total_margin ?? 0), pim: +(a.position_initial_margin ?? 0), copy_reserved: +(a.copy_reserved_balance ?? 0), copy_deployed: +(a.copy_deployed_margin ?? 0),
        isolated: Object.values(a.symbol_settings ?? {}).filter((s) => s.margin_mode === 'isolated').length,
        subs: (a.sub_accounts ?? []).map((s) => s.account_id ?? s),
        bal_wallet: b.reduce((t, r) => t + +(r.walletBalance ?? 0), 0), staking: b.reduce((t, r) => t + +(r.stakingRewardBalance ?? 0), 0), locked: b.reduce((t, r) => t + +(r.lockedRewards ?? 0), 0),
        lb_equity: lbById[q.id] ? +lbById[q.id].equity : null, lb_upnl: lbById[q.id] ? +lbById[q.id].unrealized_pnl : null, lb_wallet: lbById[q.id] ? +lbById[q.id].wallet_balance : null,
        lb_vault_deposits: lbById[q.id] ? +(lbById[q.id].vault_deposits ?? 0) : null, address: a.blockchain_address });
      for (const s of a.sub_accounts ?? []) { const sid = s.account_id ?? s; if (!seen.has(sid) && !String(sid).startsWith('vault_')) { seen.add(sid); queue.push({ id: sid, sub: true, parent: q.id }); } }
    } catch (e) { rows.push({ id: q.id, error: String(e) }); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
for (const e of lb.entries.filter((e) => e.vault_id)) {
  const a = await j(`${B}/v2/account?vault_id=${e.vault_id}`);
  let shares = 0, cursor, deps = [];
  do { const p = await j(`${B}/v2/vault/${e.vault_id}/depositors?limit=500${cursor ? `&cursor=${cursor}` : ''}`); for (const d of p.depositors ?? []) { shares += +d.current_equity; deps.push(d); } cursor = p.next_cursor || undefined; } while (cursor);
  rows.push({ id: e.vault_id, kind: 'vault', name: e.vault_name, wallet: +a.wallet_balance, upnl: +(a.unrealized_pnl ?? 0), margin: +a.margin_balance, total_margin: +(a.total_margin ?? 0), pim: +(a.position_initial_margin ?? 0), shares, depositors: deps.length, dep_addresses: deps.map((d) => d.address) });
}
writeFileSync(OUT, JSON.stringify(rows));
console.log('rows', rows.length, 'errors', rows.filter((r) => r.error).length);
