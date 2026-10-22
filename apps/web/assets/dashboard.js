import { $, esc, usd, num, pct, short, compactUsd, ago, hhmm, statusClass, poll, getJSON, LOGO } from './common.js';

$('logo').innerHTML = LOGO;
const CHAIN_NAMES = { ethereum: 'Ethereum', solana: 'Solana', cardano: 'Cardano' };
let config;
getJSON('/api/config').then((c) => {
  config = c;
  if (c.telegramChannel) { $('tg-link').href = c.telegramChannel; $('tg-link').style.display = ''; }
}).catch(() => {});

function explorer(chain, addr) {
  if (chain === 'ethereum') return `https://etherscan.io/address/${addr}`;
  if (chain === 'solana') return `https://solscan.io/account/${addr}`;
  return `https://cardanoscan.io/address/${addr}`;
}

function renderRatio(s) {
  const r = s.ratio;
  if (!r) { $('scan-meta').textContent = 'First full account scan in progress (takes ~3 min)…'; return; }
  const a = r.published;
  const st = a.status;
  // "Needs review" is never published as a number in the headline (ratio rules); it is shown in the detail line.
  const headline = st === 'Needs review' ? 'Under review' : pct(a.ratio, 2);
  $('h-ratio').textContent = headline;
  $('h-ratio').style.color = st === 'Balanced' ? 'var(--green)' : st === 'Needs review' ? 'var(--red)' : 'var(--amber)';
  $('h-ratio-st').textContent = st ? `· ${st}` : '';
  $('ratio').textContent = headline;
  $('ratio').style.color = $('h-ratio').style.color;
  $('ratio').style.fontSize = st === 'Needs review' ? '56px' : '';
  $('status').className = `status ${statusClass(st)}`;
  $('status').textContent = st ?? '—';
  const gapText = a.gapUsd === undefined ? '' : `Gap ${a.gapUsd < 0 ? '−' : '+'}${usd(Math.abs(a.gapUsd))} · ${a.gapUsd < 0 ? '−' : '+'}${Math.abs(a.gapPct).toFixed(4)}%`;
  $('gap').textContent = st === 'Needs review' ? `computed ${pct(a.ratio, 2)} · ${gapText} · not published` : gapText;
  const explain = {
    Balanced: 'Reserves match what Strike owes users to within ±0.01%.',
    Drift: 'Reserves and liabilities differ by 0.01–1%. Per-chain and per-asset detail below; re-checked every scan.',
    Incomplete: `The gap is explained by components that are not exposed yet (${a.explainedBy ?? 'pending'}). Not a solvency signal.`,
    'In transit': `The gap is within funds Strike reports as in transit (${a.explainedBy ?? ''}). Not Drift, not insolvency; the missing amount is not added.`,
    'Needs review': 'The two sides differ by more than 1%. This is logged for investigation and is NOT published as insolvency — most often a missed asset, an unpriced token or an accounting rule to confirm with Strike.',
  };
  $('ratio-explain').textContent = `${explain[st] ?? ''} Strike is not a CEX: the ratio should be exactly 100%; above or below both need a look.`;
  const dev = a.ratio === undefined ? 0 : Math.max(-1.2, Math.min(1.2, (a.ratio - 1) * 100));
  $('needle').style.left = `${50 + (dev / 1.2) * 50}%`;
  $('ratio-src').innerHTML = `Liability scan ${esc(new Date(r.scanWindow[0]).toISOString().slice(11, 19))}–${esc(new Date(r.scanWindow[1]).toISOString().slice(11, 19))} UTC · reserves read ${esc(ago(r.reservesTs))} · confidence <b>${esc(r.confidence)}</b>${r.failed ? ` (${r.failed} failed)` : ''}`
    + (r.vaultsIncludedAudit?.ratio !== undefined ? `<br>Audit (vault accounts included): ${pct(r.vaultsIncludedAudit.ratio, 2)} — see docs/DECISIONS.md` : '');
  $('scan-meta').textContent = `Last scan ${ago(r.ts)} · ${s.liabilities?.read?.toLocaleString('en-US') ?? '—'} accounts · reserves ${ago(s.reserves?.ts)}`;
  $('res-usd').textContent = usd(r.reservesUsd);
  $('lia-usd').textContent = usd(r.liabilitiesUsd);
  const max = Math.max(r.reservesUsd, r.liabilitiesUsd) || 1;
  $('bar-res').style.width = `${(r.reservesUsd / max) * 100}%`;
  $('bar-lia').style.width = `${(r.liabilitiesUsd / max) * 100}%`;
}

function renderReserves(s) {
  const res = s.reserves;
  if (!res) return;
  $('h-res').textContent = compactUsd(res.pricedUsd);
  const holders = new Set(res.rows.map((x) => x.holder));
  $('res-sub').textContent = `3 chains · ${holders.size} addresses · ${ago(res.ts)}${res.stalePrices ? ' · STALE PRICES' : ''}`;
  const byChain = {};
  for (const row of res.rows) (byChain[row.chain] ??= []).push(row);
  $('chains').innerHTML = ['ethereum', 'solana', 'cardano'].map((c) => {
    const rows = byChain[c] ?? [];
    const total = rows.reduce((x, r) => x + (r.usdValue ?? 0), 0);
    const addrs = [...new Set(rows.map((r) => r.holder))];
    const lines = rows.filter((r) => r.amount > 0).map((r) => `<div class="kv"><span title="${esc(r.contract ?? 'native')}">${esc(r.asset.length > 14 ? short(r.asset) : r.asset)}${r.price?.source?.startsWith('peg') ? ' <span class="src">peg</span>' : ''}</span><span>${num(r.amount)}${r.usdValue === undefined ? ' <span style="color:var(--amber)">unpriced</span>' : ''}</span></div>`).join('');
    const failed = s.errors?.reserves?.message?.includes(c);
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:600;font-size:17px">${CHAIN_NAMES[c]}</div><span class="src">${addrs.length} address${addrs.length === 1 ? '' : 'es'}</span></div>
      <div class="mono" style="font-size:28px;font-weight:700">${usd(total)}</div>
      <div style="display:flex;flex-direction:column;gap:6px">${lines || '<span class="label">No balances</span>'}</div>
      ${failed ? '<div class="note red">Collector failed on the last run; showing the previous good read.</div>' : ''}
      ${addrs.map((a) => `<a class="mono" style="font-size:13px" href="${explorer(c, a)}" target="_blank" rel="noopener">${esc(short(a))} ↗</a>`).join('')}</div>`;
  }).join('');
  $('unpriced').innerHTML = res.unpriced.length
    ? `<div class="note"><b>Unpriced reserves (not in the ratio):</b> ${res.unpriced.map((u) => `${esc(u.chain)} ${esc(u.asset.length > 14 ? short(u.asset) : u.asset)} ${num(u.amount)}`).join(' · ')}. Strike's official price API for these assets is not public yet; ZeroGap does not guess prices.</div>` : '';
}

function renderLiabilities(s) {
  const l = s.liabilities;
  if (!l) return;
  $('h-acc').textContent = l.read.toLocaleString('en-US');
  $('lia-sub').textContent = `${l.read.toLocaleString('en-US')} accounts read · ${l.failedCount} failed · ${ago(l.ts)}`;
  const fmt = (c) => c.usd === undefined ? '—' : c.status === 'deducted' ? `−${num(c.usd, 0)}` : num(c.usd, 0);
  const rows = l.components.map((c) => `<tr><td>${esc(c.name === 'margin_balance' ? 'Account value' : c.name)}</td><td style="color:var(--dim)">${esc(c.source.replace('GET ', ''))}</td><td class="r" style="${c.status === 'excluded' ? 'color:var(--dim)' : ''}">${c.status === 'excluded' ? `${fmt(c)} <span class="src">not counted</span>` : fmt(c)}</td></tr>`);
  rows.push(`<tr><td>Vault accounts (excluded)</td><td style="color:var(--dim)">${l.excludedVaults} vaults · ${num(l.vaultsUsd, 0)} audit</td><td class="r" style="color:var(--dim)">not counted</td></tr>`);
  rows.push(`<tr><td style="font-weight:700;border-top-color:var(--line2)">Total withdrawable</td><td style="border-top-color:var(--line2)"></td><td class="r" style="font-weight:700;border-top-color:var(--line2)">${num(l.exposedUsd, 0)}</td></tr>`);
  $('lia-rows').innerHTML = rows.join('');
  $('pending-notes').innerHTML = (s.ratio?.inTransitNote ? `<div class="note">${esc(s.ratio.inTransitNote)}</div>` : '')
    + '<div class="note" style="background:transparent">Liabilities are what users can withdraw: account value minus locked rewards (rewards are tradeable only, per Strike).</div>';
}

function renderFlows(s) {
  const f = s.flows;
  if (!f) { $('flow-rows').innerHTML = '<tr><td colspan="7" class="label">First flow check running…</td></tr>'; return; }
  const comparable = f.rows.filter((r) => r.comparable);
  const latest = {};
  for (const r of comparable) if (!latest[r.chain] || r.day > latest[r.chain].day) latest[r.chain] = r;
  const color = (p) => (p >= 99 ? 'var(--green2)' : p >= 90 ? 'var(--amber)' : 'var(--red)');
  $('flow-day').textContent = 'latest full day';
  $('flow-rows').innerHTML = ['ethereum', 'solana', 'cardano'].map((c) => {
    const r = latest[c];
    if (!r) return `<tr><td>${CHAIN_NAMES[c]}</td><td colspan="6" class="label">no full day inside on-chain coverage yet</td></tr>`;
    return `<tr><td>${CHAIN_NAMES[c]} <span class="src">${esc(r.day)}</span></td><td class="r">${num(r.reportedIn, 0)}</td><td class="r">${num(r.onchainIn, 0)}</td><td class="r" style="color:${color(r.matchInPct)}">${r.matchInPct.toFixed(1)}%</td><td class="r">${num(r.reportedOut, 0)}</td><td class="r">${num(r.onchainOut, 0)}</td><td class="r" style="color:${color(r.matchOutPct)}">${r.matchOutPct.toFixed(1)}%</td></tr>`;
  }).join('');
  $('flow-all').innerHTML = f.rows.slice().reverse().map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.chain)}</td><td class="r">${r.matchInPct.toFixed(1)}%</td><td class="r">${r.matchOutPct.toFixed(1)}%</td><td class="src">${esc(r.note ?? '')}${r.unpricedMoves ? ` · ${r.unpricedMoves} unpriced moves` : ''}</td></tr>`).join('');
  $('flow-cov').innerHTML = f.coverage.map((c) => `${esc(c.chain)}: ${esc(new Date(c.fromTs).toISOString().slice(0, 16))} → ${esc(new Date(c.toTs).toISOString().slice(0, 16))}${c.note ? ` — ${esc(c.note)}` : ''}`).join('<br>') + `<br>Checked ${esc(ago(f.ts))} · ${f.moves} on-chain moves decoded`;
}

function renderSafety(s) {
  const sf = s.safety;
  if (!sf) return;
  const sol = s.solanaSafety;
  const anyPaused = sf.paused || !!(sol && (sol.paused || sol.recovered));
  const queuedOpen = sf.largeWithdrawal.pendingCount + (sol?.pendingWithdrawalCount ?? 0);
  const timelocked = s.events.filter((e) => e.type === 'ActionProposed').length - s.events.filter((e) => e.type === 'ActionFinalized' || e.type === 'ActionCancelled').length;
  $('safety-cards').innerHTML = [
    `<div class="card"><div class="label">Vault status</div><div style="font-size:22px;font-weight:600;color:${anyPaused ? 'var(--red)' : 'var(--green2)'}">${anyPaused ? 'PAUSED' : 'Not paused'}</div><div class="label">Ethereum ${sf.paused ? 'PAUSED' : 'ok'} · Solana ${sol ? (sol.paused ? 'PAUSED' : sol.recovered ? 'RECOVERED' : 'ok') + ` · ${sol.pendingWithdrawalCount} queued` : 'not read'} · on-chain</div></div>`,
    `<div class="card"><div class="label">Large withdrawals queued</div><div class="mono" style="font-size:22px;font-weight:700">${queuedOpen}</div><div class="label">Queue delay ${Math.round(sf.largeWithdrawal.queueDelaySecs / 3600)} h before payout · cap ${sf.largeWithdrawal.maxPending}</div></div>`,
    `<div class="card"><div class="label">Timelocked changes</div><div class="mono" style="font-size:22px;font-weight:700">${Math.max(0, timelocked)} pending</div><div class="label">Upgrades, limits, roles · ${Math.round(sf.timelock.delaySecs / 3600)} h timelock</div></div>`,
    `<div class="card" style="gap:10px"><div class="label">24h withdrawal limit used (USDC)</div><div class="mono" style="font-size:22px;font-weight:700">${sf.usdc24h.usedPct.toFixed(1)}%</div><div class="bar"><div style="width:${Math.min(100, sf.usdc24h.usedPct)}%"></div></div><div class="label">${num(sf.usdc24h.current, 0)} of ${num(sf.usdc24h.limit, 0)} USDC · 1h ${sf.usdc1h.usedPct.toFixed(1)}%</div></div>`,
  ].join('');
  $('safety-src').textContent = `${sf.source} · read ${ago(sf.ts)} · global budget 24h ${sf.global24h.usedPct.toFixed(1)}% used`;
}

function renderFeed(s) {
  const items = s.feed ?? [];
  $('feed').innerHTML = items.length ? items.slice(0, 15).map((i) => `<li><span class="t">${esc(hhmm(i.ts).slice(0, 5))}</span><span style="color:${/Alert/.test(i.kind) ? 'var(--red)' : i.kind === 'Balanced' ? 'var(--green2)' : 'var(--mute)'}">${esc(i.kind)}</span><span style="color:var(--ink2)">${esc(i.text)}</span>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">tx ↗</a>` : ''}</li>`).join('') : '<li class="label">No events yet</li>';
  const errs = Object.entries(s.errors ?? {});
  $('errors').innerHTML = errs.map(([k, v]) => `<span class="pill warn" title="${esc(v.message)}">${esc(k)}: last run failed ${esc(ago(v.at))}</span>`).join(' ');
}

async function renderHistory() {
  try {
    const h = (await getJSON('/api/history')).filter((p) => p.ratio !== undefined && p.ratio !== null);
    if (h.length < 2) { $('history').innerHTML = `<p class="label">${h.length} scan${h.length === 1 ? '' : 's'} recorded so far — the chart appears after the second scan.</p>`; return; }
    const W = 1000, H = 140, xs = h.map((p) => p.ts), ys = h.map((p) => p.ratio * 100);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(99, ...ys), y1 = Math.max(101, ...ys);
    const X = (t) => ((t - x0) / (x1 - x0 || 1)) * W, Y = (v) => H - ((v - y0) / (y1 - y0 || 1)) * H;
    const d = h.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p.ratio * 100).toFixed(1)}`).join('');
    $('history').innerHTML = `<svg viewBox="0 0 ${W} ${H + 20}" width="100%" height="160" role="img" aria-label="Reserve ratio history">
      <line x1="0" x2="${W}" y1="${Y(100)}" y2="${Y(100)}" stroke="#2A3633" stroke-dasharray="4 4"/><text x="4" y="${Y(100) - 4}" fill="#8FA19B" font-size="12" font-family="JetBrains Mono">100%</text>
      <path d="${d}" fill="none" stroke="#4ADE80" stroke-width="2"/></svg>`;
    $('hist-src').textContent = `${h.length} scans · ${new Date(x0).toISOString().slice(0, 16)} → ${new Date(x1).toISOString().slice(0, 16)} UTC`;
  } catch { /* keep last render */ }
}

/** T3.2: data older than 10 minutes shows a warning banner (values stay visible, marked stale). */
export function staleMessage(s, now = Date.now()) {
  const age = now - (s.ratio?.ts ?? s.now ?? 0);
  return age > 10 * 60_000 ? `Stale data: last full scan ${Math.round(age / 60_000)} min ago. Values below are the last good snapshot.` : '';
}

poll((s) => { const m = staleMessage(s); $('stale-banner').textContent = m; $('stale-banner').style.display = m ? '' : 'none'; renderReserves(s); renderLiabilities(s); renderRatio(s); renderFlows(s); renderSafety(s); renderFeed(s); });
renderHistory(); setInterval(renderHistory, 60000);
