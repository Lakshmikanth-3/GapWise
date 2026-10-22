const B = 'https://api.strikefinance.org';
const lb = await (await fetch(`${B}/stat/v1/stats/leaderboard`)).json();
const vaults = lb.entries.filter(e => e.vault_id);
let sumAcct = 0, sumDep = 0;
for (const v of vaults) {
  const acct = await (await fetch(`${B}/v2/account?vault_id=${v.vault_id}`)).json();
  const r = await fetch(`${B}/v2/vault/${v.vault_id}/depositors?limit=500`);
  const body = await r.json();
  const list = body.depositors ?? body.data ?? body.items ?? (Array.isArray(body) ? body : []);
  if (v === vaults[0]) console.log('response keys', Object.keys(body), 'first depositor', JSON.stringify(list[0]).slice(0, 400));
  const dep = list.reduce((s, d) => s + Number(d.equity ?? d.equity_usd ?? d.current_equity ?? 0), 0);
  sumAcct += Number(acct.margin_balance); sumDep += dep;
  console.log(`${(v.vault_name || v.account_id).padEnd(34)} vault margin_balance ${Number(acct.margin_balance).toFixed(2).padStart(14)} · Σ depositor equity ${dep.toFixed(2).padStart(14)} · depositors ${list.length}${body.total ? '/' + body.total : ''} · http ${r.status}`);
}
console.log(`TOTAL vault accounts ${sumAcct.toFixed(2)} · Σ depositor equity ${sumDep.toFixed(2)}`);
