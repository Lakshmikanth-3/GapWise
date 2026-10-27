// "Why is there a gap?" — renders the Gap Investigator's latest result (/api/why) and starts new runs (/api/why/run).
// Every number shown comes from the investigation JSON, which comes from the verified report; nothing is computed here
// except bar widths.
import { $, esc, usd, ago, getJSON } from './common.js';

const STATUS = {
  confirmed: { label: 'Confirmed', color: 'var(--green2)', bg: 'var(--greenbg)' },
  supported: { label: 'Supported inference', color: 'var(--green)', bg: 'var(--greenbg)' },
  hypothesis: { label: 'Hypothesis', color: 'var(--amber)', bg: 'var(--amberbg)' },
  unresolved: { label: 'Unresolved', color: 'var(--amber)', bg: 'var(--amberbg)' },
  rejected: { label: 'Ruled out', color: 'var(--dim)', bg: 'var(--chip)' },
};
const ORDER = { confirmed: 0, supported: 1, hypothesis: 2, unresolved: 3, rejected: 4 };
const signed = (n) => (n === null || n === undefined ? 'not quantified' : `${n < 0 ? '−' : n > 0 ? '+' : ''}${usd(Math.abs(n))}`);
const chip = (s) => `<span class="why-chip" style="color:${STATUS[s].color};background:${STATUS[s].bg}">${STATUS[s].label}</span>`;

function evidenceItem(e) {
  const val = esc(e.value.length > 220 ? `${e.value.slice(0, 220)}…` : e.value);
  return `<li><span class="why-ev ${e.type}">${e.type.toUpperCase()}</span> <b>${esc(e.id)}</b> ${esc(e.label)}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">open ↗</a>` : ''}<div class="mono why-val">${val}</div></li>`;
}

function causeRow(c, scale) {
  const w = c.usd === null ? 0 : Math.max(2, Math.min(100, (Math.abs(c.usd) / scale) * 100));
  const col = STATUS[c.status].color;
  return `<details class="why-cause">
    <summary>
      <div class="why-cause-head"><span class="why-cause-name">${esc(c.cause)}</span>${chip(c.status)}<span class="mono why-usd">${signed(c.usd)}</span></div>
      <div class="why-bar"><i style="width:${w}%;background:${col};opacity:${c.attributed ? 1 : 0.45}"></i></div>
      <div class="why-sub">${c.attributed ? 'Counted toward the explained part' : 'Not counted toward the explained part'} · confidence ${esc(c.confidence)} · ${c.evidence.length} evidence item(s)</div>
    </summary>
    <div class="why-body">
      ${c.narrative ? `<p class="why-ai">${esc(c.narrative)}</p>` : ''}
      <p>${esc(c.explanation)}</p>
      ${c.calculation ? `<p class="mono why-calc">${esc(c.calculation)}</p>` : ''}
      <ul class="why-evlist">${c.evidence.map(evidenceItem).join('')}</ul>
    </div>
  </details>`;
}

function render(inv, status) {
  const box = $('why-body');
  if (!inv) {
    box.innerHTML = `<p class="why-empty">No investigation yet. Press <b>Investigate gap</b> to have GapWise test every known cause against the latest verified scan.</p>`;
    return;
  }
  const gapCauses = inv.causes.filter((c) => c.scope === 'gap').sort((a, b) => ORDER[a.status] - ORDER[b.status] || Math.abs(b.usd ?? 0) - Math.abs(a.usd ?? 0));
  const scale = Math.max(Math.abs(inv.gap_usd), ...gapCauses.map((c) => Math.abs(c.usd ?? 0)), 1);
  const explained = inv.gap_usd - inv.unexplained_usd;
  const ch = inv.change_since_previous;
  const chScale = ch ? Math.max(...ch.components.map((c) => Math.abs(c.usd)), Math.abs(ch.delta_usd), 1) : 1;
  const ai = inv.rules_only
    ? `<span class="why-chip" style="color:var(--amber);background:var(--amberbg)" title="${esc(inv.inference?.error ?? 'AI not configured')}">rules-only</span>`
    : `<span class="why-chip" style="color:var(--green2);background:var(--greenbg)">${esc(inv.model)}${inv.inference?.nemotron_verified ? ' · NVIDIA Nemotron verified' : ''}</span>`;
  box.innerHTML = `
    <div class="why-meta">${ai}<span>${esc(inv.trigger)} run ${ago(Date.parse(inv.created_at))}</span><span class="mono">scan ${esc(inv.scan_id)}</span><a href="/api/report" title="${esc(inv.report_sha256)}">report sha256 ${esc(inv.report_sha256.slice(0, 12))}… ↗</a></div>
    <p class="why-verdict">${esc(inv.verdict)}</p>
    <div class="why-totals">
      <div><div class="label">Gap (reserves − owed)</div><div class="mono why-big">${signed(inv.gap_usd)}</div></div>
      <div><div class="label">Explained by confirmed / supported causes</div><div class="mono why-big">${signed(explained)}</div></div>
      <div><div class="label">Unexplained</div><div class="mono why-big" style="color:${Math.abs(inv.unexplained_usd) >= 1 ? 'var(--amber)' : 'var(--green2)'}">${signed(inv.unexplained_usd)}</div></div>
    </div>
    <h3>Causes tested</h3>
    <div class="why-causes">${gapCauses.map((c) => causeRow(c, scale)).join('')}</div>
    ${ch ? `<h3>What changed since the previous scan <span class="label">(${esc(ch.from_scan)}, ${ago(Date.parse(ch.from_ts))})</span></h3>
      <p class="why-sub">Gap ${signed(ch.gap_before)} → ${signed(ch.gap_after)} = ${signed(ch.delta_usd)}. These parts add up exactly; remainder ${signed(ch.remainder_usd)}.</p>
      <div class="why-causes">${ch.components.map((c) => `<div class="why-comp"><span>${esc(c.label)}</span><div class="why-bar"><i style="width:${Math.max(1, (Math.abs(c.usd) / chScale) * 100)}%;background:${c.usd >= 0 ? 'var(--green)' : 'var(--red)'}"></i></div><span class="mono">${signed(c.usd)}</span></div>`).join('')}</div>
      <div class="why-causes">${inv.causes.filter((c) => c.scope === 'change').map((c) => causeRow(c, chScale)).join('')}</div>` : ''}
    <div class="why-next"><b>Next check:</b> ${esc(inv.next_check)}</div>
    <details><summary>Sources, memory and tool calls</summary>
      <ul class="why-evlist">${inv.sources_used.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${inv.memory.recalled.length ? `<p class="label">Recalled from memory (H-MEM):</p><ul class="why-evlist">${inv.memory.recalled.map((m) => `<li><b>${esc(m.id)}</b> ${esc(m.content)} <span class="label">(${esc(m.source)})</span></li>`).join('')}</ul>` : ''}
      ${inv.tool_calls.length ? `<p class="label">Tool calls made by the model:</p><ul class="why-evlist">${inv.tool_calls.map((t) => `<li class="mono">${esc(t.tool)}(${esc(JSON.stringify(t.args)).slice(0, 200)}) → ${t.ok ? `ok ${esc(t.evidence_id ?? '')}` : `error: ${esc(t.error)}`} · ${t.ms} ms</li>`).join('')}</ul>` : ''}
    </details>
    ${inv.warnings.length ? `<div class="note">${inv.warnings.map(esc).join('<br>')}</div>` : ''}
    ${status ? `<div class="src">Integrations: Meterless ${esc(status.integrations.meterless.state)}${status.integrations.meterless.requested_model ? ` (${esc(status.integrations.meterless.requested_model)})` : ''} · Zetaris ${esc(status.integrations.zetaris.state)} · H-MEM ${status.integrations.memory.records} memories</div>` : ''}`;
}

let running = false;
async function refresh() {
  let inv = null, err = null, status = null;
  try { inv = await getJSON('/api/why'); } catch (e) { err = e; }
  try { status = await getJSON('/api/why/status'); } catch { /* published (static) deployment: no live status */ }
  const busy = inv?.investigating ?? status?.investigating;
  running = !!busy;
  $('why-run').disabled = running || !status;
  $('why-run').textContent = running ? 'Investigating…' : 'Investigate gap';
  $('why-state').textContent = running ? `Running since ${ago(busy.since)} — checking every source` : !status ? 'Read-only published view: runs happen on the GapWise server' : '';
  if (err && !String(err.message).includes('404')) { $('why-body').innerHTML = `<div class="note red">Could not load the investigation (${esc(err.message)}). The monitor above is unaffected. <button class="btn ghost" id="why-retry">Retry</button></div>`; $('why-retry').onclick = refresh; return; }
  render(err ? null : inv, status);
}

$('why-run').addEventListener('click', async () => {
  $('why-run').disabled = true;
  try {
    const res = await fetch('/api/why/run', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 409) $('why-state').textContent = j.error ?? `HTTP ${res.status}`;
  } catch (e) { $('why-state').textContent = e.message; }
  setTimeout(refresh, 500);
});

refresh();
setInterval(() => { if (running) refresh(); }, 3000);
setInterval(() => { if (!running && document.visibilityState === 'visible') refresh(); }, 60000);
