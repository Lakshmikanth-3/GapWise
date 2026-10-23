// Shared helpers for ZeroGap pages. Every number shown comes from /api/state with its own timestamp.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = (n, d = 0) => (n === undefined || n === null || Number.isNaN(n) ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const num = (n, d = 2) => (n === undefined || n === null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d }));
export const pct = (r, d = 2) => (r === undefined || r === null ? '—' : `${(r * 100).toFixed(d)}%`);
export const short = (a) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const compactUsd = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : usd(n));
export function ago(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`;
}
export const hhmm = (ts) => new Date(ts).toISOString().slice(11, 16) + ' UTC';
// A gap beyond ±1% is shown as under review with Strike (founder, 23 Oct): amber, never a red alarm or "insolvent".
export const statusClass = (s) => (s === 'Needs review' || s === 'In transit' ? 'Drift' : s || '');
export const statusLabel = (s) => (s === 'Needs review' ? 'Under review with Strike' : s ?? '—');
export const statusColor = (s) => (s === 'Balanced' ? 'var(--green)' : 'var(--amber)');

/** Which deployment the page shows: the published mainnet result (default) or the labelled testnet one. */
export const NETWORK = new URLSearchParams(location.search).get('network') === 'testnet' ? 'testnet' : 'mainnet';
export const withNet = (path) => (NETWORK === 'testnet' ? `${path}${path.includes('?') ? '&' : '?'}network=testnet` : path);

export async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

/** Calls `render(state)` now and every `ms`; shows a banner if the API is unreachable (last render stays). */
export function poll(render, ms = 15000) {
  const tick = async () => {
    try { render(await getJSON(withNet('/api/state'))); document.body.classList.remove('offline'); }
    catch (e) { document.body.classList.add('offline'); console.error(e); }
  };
  tick();
  return setInterval(tick, ms);
}

export const LOGO = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16L4 19h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CHECK = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#10261E"/><path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CROSS = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#2A1414"/><path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="#FF8A80" stroke-width="2" stroke-linecap="round"/></svg>';
export const WAIT = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#15130C"/><path d="M10 5v5l3 2" fill="none" stroke="#E8C46A" stroke-width="2" stroke-linecap="round"/></svg>';
