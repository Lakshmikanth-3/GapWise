// Two landing visuals, both fed only by /api/state:
// 1. mountStack: glass layers (Accounts, Liabilities, Reserves, Ratio) wired to Ethereum / Solana / Cardano nodes.
// 2. mountWave: a violet particle terrain with Reserves / Ratio / Liabilities cards on pins.
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; };
const MONO = 'Geist Mono, ui-monospace, monospace';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const usd = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
const statusText = (a) => (a.status === 'Needs review' ? 'Reconciling' : a.status);

export function mountStack(host) {
  const svg = el('svg', { viewBox: '0 0 720 420', role: 'img', 'aria-label': 'Live GapWise layers: accounts, liabilities, reserves and ratio, fed by Ethereum, Solana and Cardano' }, host);
  el('defs', {}, svg).innerHTML = `
    <linearGradient id="st-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2458" stop-opacity=".9"/><stop offset="1" stop-color="#0f0d22" stop-opacity=".9"/></linearGradient>
    <radialGradient id="st-glow"><stop offset="0" stop-color="#8b7dff" stop-opacity=".55"/><stop offset="1" stop-color="#8b7dff" stop-opacity="0"/></radialGradient>`;
  el('ellipse', { cx: 190, cy: 380, rx: 220, ry: 40, fill: 'url(#st-glow)' }, svg);
  const LAYERS = [['ACCOUNTS', 'acc'], ['LIABILITIES', 'lia'], ['RESERVES', 'res'], ['RATIO', 'ratio']];
  const vals = {}, names = {};
  LAYERS.forEach(([name, key], i) => {
    const y = 30 + i * 88, g = el('g', { transform: `translate(30 ${y})` }, svg);
    el('path', { d: 'M0 14 18 0 330 0 330 62 312 76 0 76Z', fill: 'url(#st-face)', stroke: '#8f86f0', 'stroke-width': 1, opacity: .95 }, g);
    el('path', { d: 'M0 14 18 0 330 0 312 14Z', fill: '#3a3280', opacity: .55 }, g);
    el('path', { d: 'M312 14 330 0 330 62 312 76Z', fill: '#1b1740', opacity: .9 }, g);
    el('rect', { x: 18, y: 28, width: 30, height: 30, rx: 8, fill: '#3b3285', stroke: '#a89fff', 'stroke-width': .8 }, g);
    el('circle', { cx: 33, cy: 43, r: 7, fill: 'none', stroke: '#e6e3ff', 'stroke-width': 2 }, g);
    names[key] = el('text', { x: 64, y: 38, fill: '#c9c5ff', 'font-size': 10, 'letter-spacing': 1.6, 'font-family': MONO }, g); names[key].textContent = name;
    vals[key] = el('text', { x: 64, y: 60, fill: '#f1efff', 'font-size': 20, 'font-family': MONO }, g); vals[key].textContent = '…';
  });
  const NODES = [['Ethereum', 'ethereum', 70], ['Solana', 'solana', 190], ['Cardano', 'cardano', 310]];
  const chainVals = {};
  const wires = [];
  for (const [name, key, y] of NODES) {
    for (let k = 0; k < 7; k++) {
      const sy = 120 + k * 22 + (y - 190) * .1;
      wires.push(el('path', { d: `M360 ${sy} C 450 ${sy}, 470 ${y + 24}, 540 ${y + 24}`, fill: 'none', stroke: '#9b92ff', 'stroke-width': .7, opacity: .28 + (k % 3) * .1 }, svg));
    }
    const g = el('g', { transform: `translate(540 ${y})` }, svg);
    el('rect', { width: 160, height: 50, rx: 8, fill: 'rgba(14,12,30,.9)', stroke: '#5a52a8' }, g);
    el('path', { d: 'M24 12 34 25 24 38 14 25Z', fill: '#8f84ff', stroke: '#d9d5ff', 'stroke-width': .8 }, g);
    const t = el('text', { x: 46, y: 22, fill: '#ecebff', 'font-size': 13, 'font-family': 'Geist, system-ui, sans-serif' }, g); t.textContent = name;
    chainVals[key] = el('text', { x: 46, y: 39, fill: '#9d9bb5', 'font-size': 10.5, 'font-family': MONO }, g); chainVals[key].textContent = 'Live data';
  }
  const dots = wires.filter((_, i) => i % 2 === 0).map((w) => ({ w, len: w.getTotalLength(), t: Math.random(), c: el('circle', { r: 1.6, fill: '#efedff' }, svg) }));
  const place = () => dots.forEach((d) => { const p = d.w.getPointAtLength((1 - d.t) * d.len); d.c.setAttribute('cx', p.x); d.c.setAttribute('cy', p.y); });
  place();
  if (!reduce) { let last = performance.now(); const tick = (n) => { const dt = Math.min(.05, (n - last) / 1000); last = n; dots.forEach((d) => { d.t = (d.t + dt * .18) % 1; }); place(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  return (s) => {
    if (s.liabilities) { vals.acc.textContent = s.liabilities.read.toLocaleString('en-US'); vals.lia.textContent = usd(s.liabilities.exposedUsd); }
    if (s.reserves) {
      vals.res.textContent = usd(s.reserves.pricedUsd);
      for (const [, key] of NODES) { const rows = (s.reserves.rows ?? []).filter((r) => r.chain === key); if (rows.length) chainVals[key].textContent = `${usd(rows.reduce((t, r) => t + (r.usdValue ?? 0), 0))} · live`; }
    }
    const a = s.ratio?.published;
    if (a) { vals.ratio.textContent = `${(a.ratio * 100).toFixed(2)}%`; names.ratio.textContent = `RATIO · ${statusText(a).toUpperCase()}`; }
  };
}

export function mountWave(host) {
  const canvas = document.createElement('canvas'); host.appendChild(canvas);
  const cards = document.createElement('div'); cards.className = 'wave-cards'; host.appendChild(cards);
  const mk = (label) => { const c = document.createElement('div'); c.className = 'wave-card'; c.innerHTML = `<span>${label}</span><b>…</b>`; cards.appendChild(c); return c.querySelector('b'); };
  const cRes = mk('Reserves'), cRatio = mk('Ratio'), cLia = mk('Liabilities');
  const ctx = canvas.getContext('2d');
  const COLS = innerWidth < 760 ? 70 : 130, ROWS = innerWidth < 760 ? 22 : 34;
  const pins = Array.from({ length: 18 }, () => ({ u: Math.random(), v: Math.random() * .6 + .2, h: 30 + Math.random() * 60 }));
  function draw(t) {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = host.clientWidth, H = host.clientHeight;
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const proj = (u, v) => {
      const z = .35 + v * .9, x = (u - .5) * W * 1.5 / z + W / 2;
      const h = Math.sin(u * 9 + t * .6) * Math.cos(v * 6 - t * .4) * 26 + Math.sin(u * 3.2 - t * .3) * 34;
      return [x, H * .42 + (v * H * .55) - h * (1.1 - v * .5), 1 / z];
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const [x, y, s] = proj(c / (COLS - 1), r / (ROWS - 1));
      if (x < -10 || x > W + 10) continue;
      ctx.fillStyle = `rgba(${170 + r * 2},${150 + r},255,${.18 + .5 * (r / ROWS)})`;
      ctx.fillRect(x, y, 1.1 * s + .4, 1.1 * s + .4);
    }
    ctx.strokeStyle = 'rgba(200,190,255,.45)'; ctx.fillStyle = '#efeaff';
    for (const p of pins) { const [x, y] = proj(p.u, p.v); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - p.h); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - p.h, 2.2, 0, 7); ctx.fill(); }
    if (!reduce) requestAnimationFrame((n) => draw(n / 1000));
  }
  draw(0);
  return (s) => {
    if (s.reserves) cRes.textContent = usd(s.reserves.pricedUsd);
    if (s.liabilities) cLia.textContent = usd(s.liabilities.exposedUsd);
    const a = s.ratio?.published; if (a) cRatio.textContent = `${(a.ratio * 100).toFixed(2)}%`;
  };
}
