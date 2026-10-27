// Landing hero: Ethereum, Solana and Cardano data streams converging into one verification hub.
// Every figure and the status come from /api/state; nothing is a sample value.
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; };

const ICONS = {
  ethereum: '<path d="M0-22 13 0 0 8-13 0Z" fill="#c7c2ff"/><path d="M0 11 13 3 0 22-13 3Z" fill="#9d96f5"/>',
  solana: '<g fill="#c7c2ff"><path d="M-14-13h22l6-6h-22Z"/><path d="M-14 3h22l6-6h-22Z" transform="translate(0 0) scale(-1 1)"/><path d="M-14 19h22l6-6h-22Z"/></g>',
  cardano: '<g fill="#c7c2ff">' + [...Array(12)].map((_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${(Math.cos(a) * 15).toFixed(1)}" cy="${(Math.sin(a) * 15).toFixed(1)}" r="2.2"/>`; }).join('') + [...Array(6)].map((_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return `<circle cx="${(Math.cos(a) * 8).toFixed(1)}" cy="${(Math.sin(a) * 8).toFixed(1)}" r="2.6"/>`; }).join('') + '<circle r="3.2"/></g>',
};

export function mountHeroViz(host) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = el('svg', { viewBox: '0 0 640 600', role: 'img', 'aria-label': 'Ethereum, Solana and Cardano locker data flowing into the GapWise verification hub' }, host);
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <radialGradient id="hv-glow"><stop offset="0" stop-color="#8b7dff" stop-opacity=".55"/><stop offset="1" stop-color="#8b7dff" stop-opacity="0"/></radialGradient>
    <linearGradient id="hv-line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c7c2ff" stop-opacity=".15"/><stop offset="1" stop-color="#c7c2ff" stop-opacity=".7"/></linearGradient>
    <linearGradient id="hv-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3375"/><stop offset="1" stop-color="#16132e"/></linearGradient>
    <filter id="hv-blur"><feGaussianBlur stdDeviation="2.2"/></filter>`;

  // Faint perspective grid under the hub.
  const grid = el('g', { opacity: '.22', stroke: '#8b84d8', 'stroke-width': '.6' }, svg);
  for (let i = -8; i <= 8; i++) el('line', { x1: 320 + i * 16, y1: 470, x2: 320 + i * 60, y2: 600 }, grid);
  for (let k = 0; k < 6; k++) { const y = 470 + k * k * 4.2; el('line', { x1: 0, y1: y, x2: 640, y2: y, opacity: 1 - k / 7 }, grid); }

  // Background dust.
  const dust = el('g', { fill: '#cfcaff' }, svg);
  for (let i = 0; i < 70; i++) el('circle', { cx: (Math.random() * 640).toFixed(1), cy: (Math.random() * 600).toFixed(1), r: (Math.random() * 1.1 + .2).toFixed(2), opacity: (Math.random() * .45 + .1).toFixed(2) }, dust);

  const HUB = { x: 320, y: 420 };
  const SRC = [
    { key: 'ethereum', name: 'Ethereum', x: 130, y: 110 },
    { key: 'solana', name: 'Solana', x: 320, y: 80 },
    { key: 'cardano', name: 'Cardano', x: 510, y: 110 },
  ];
  const paths = SRC.map((s) => {
    const d = `M${s.x} ${s.y + 56} C ${s.x} ${s.y + 200}, ${HUB.x + (s.x - HUB.x) * .25} ${HUB.y - 170}, ${HUB.x + (s.x - HUB.x) * .08} ${HUB.y - 34}`;
    el('path', { d, fill: 'none', stroke: '#8b7dff', 'stroke-width': 5, opacity: .12, filter: 'url(#hv-blur)' }, svg);
    const p = el('path', { d, fill: 'none', stroke: 'url(#hv-line)', 'stroke-width': 1.3 }, svg);
    // Thin side wires for a technical feel.
    for (const off of [-9, 9]) el('path', { d, fill: 'none', stroke: '#8b84d8', 'stroke-width': .5, opacity: .35, transform: `translate(${off} 0)` }, svg);
    return p;
  });

  // Source nodes: isometric plate + chain mark + label with live locker value.
  const labels = {};
  for (const s of SRC) {
    const g = el('g', { transform: `translate(${s.x} ${s.y})` }, svg);
    el('ellipse', { cx: 0, cy: 46, rx: 54, ry: 26, fill: 'url(#hv-glow)' }, g);
    el('path', { d: 'M0 30 46 46 0 62 -46 46Z', fill: 'url(#hv-top)', stroke: '#a59cff', 'stroke-width': 1, opacity: .95 }, g);
    el('path', { d: 'M0 38 26 46 0 54 -26 46Z', fill: 'none', stroke: '#d9d5ff', 'stroke-width': .8, opacity: .7 }, g);
    const icon = el('g', { transform: 'translate(0 -4)' }, g); icon.innerHTML = ICONS[s.key];
    const t = el('text', { x: s.key === 'cardano' ? -4 : 54, y: s.key === 'cardano' ? 90 : 52, fill: '#ecebff', 'font-size': 13, 'font-family': 'Geist, system-ui, sans-serif' }, g); t.textContent = s.name;
    labels[s.key] = el('text', { x: s.key === 'cardano' ? -4 : 54, y: s.key === 'cardano' ? 106 : 68, fill: '#9d9bb5', 'font-size': 10.5, 'font-family': 'Geist Mono, monospace' }, g);
    labels[s.key].textContent = 'Lockers scanned';
  }

  // Hub: stacked isometric plates with a status mark.
  const hub = el('g', { transform: `translate(${HUB.x} ${HUB.y})` }, svg);
  el('ellipse', { cx: 0, cy: 20, rx: 150, ry: 70, fill: 'url(#hv-glow)', opacity: .8 }, hub);
  [[46, '#1b1838', .9], [30, '#221d47', .95], [14, 'url(#hv-top)', 1]].forEach(([dy, fill, o], i) => {
    const w = 96 - i * 12, h = w * .5;
    el('path', { d: `M0 ${dy - h} ${w} ${dy} 0 ${dy + h} ${-w} ${dy}Z`, fill, stroke: '#b4acff', 'stroke-width': i === 2 ? 1.4 : .9, opacity: o }, hub);
  });
  const mark = el('path', { d: 'M-16 12 -5 22 17 1', fill: 'none', stroke: '#f1efff', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, hub);
  const ring = el('circle', { cx: 0, cy: 12, r: 26, fill: 'none', stroke: '#c7c2ff', 'stroke-width': 1.2, opacity: .5 }, hub);
  const pulse = el('circle', { cx: 0, cy: 12, r: 26, fill: 'none', stroke: '#c7c2ff', 'stroke-width': 1 }, hub);

  // Side panels: reserves and liabilities with bars scaled to each other (live).
  const panel = (x, y, title) => {
    const g = el('g', { transform: `translate(${x} ${y})` }, svg);
    el('rect', { width: 132, height: 54, rx: 7, fill: 'rgba(14,12,30,.85)', stroke: '#4c4590' }, g);
    const t = el('text', { x: 12, y: 19, fill: '#a9a6c9', 'font-size': 9.5, 'letter-spacing': '1.5', 'font-family': 'Geist Mono, monospace' }, g); t.textContent = title;
    const v = el('text', { x: 12, y: 35, fill: '#f1efff', 'font-size': 12.5, 'font-family': 'Geist Mono, monospace' }, g); v.textContent = '…';
    el('rect', { x: 12, y: 42, width: 108, height: 4, rx: 2, fill: '#2a2650' }, g);
    const bar = el('rect', { x: 12, y: 42, width: 0, height: 4, rx: 2, fill: '#a89fff' }, g);
    return { v, bar };
  };
  const pRes = panel(84, 470, 'RESERVES'), pLia = panel(424, 470, 'LIABILITIES');
  const status = el('text', { x: 320, y: 552, 'text-anchor': 'middle', fill: '#ecebff', 'font-size': 13, 'letter-spacing': '2.4', 'font-family': 'Geist Mono, monospace' }, svg); status.textContent = 'LIVE VERIFICATION';
  const sub = el('text', { x: 320, y: 572, 'text-anchor': 'middle', fill: '#9d9bb5', 'font-size': 11, 'letter-spacing': '1.5', 'font-family': 'Geist Mono, monospace' }, svg); sub.textContent = 'RESERVES VS LIABILITIES';

  // Moving packets along each stream.
  const packets = [];
  paths.forEach((p, i) => { const len = p.getTotalLength(); for (let k = 0; k < 5; k++) packets.push({ p, len, t: (k / 5 + i * .13) % 1, speed: .07 + Math.random() * .03, dot: el('circle', { r: k % 2 ? 1.8 : 2.6, fill: '#efedff' }, svg), cube: k === 2 ? el('rect', { width: 7, height: 7, fill: '#8f84ff', opacity: .85 }, svg) : null }); });
  const place = () => packets.forEach((q) => { const pt = q.p.getPointAtLength(q.t * q.len); q.dot.setAttribute('cx', pt.x); q.dot.setAttribute('cy', pt.y); q.dot.setAttribute('opacity', Math.sin(q.t * Math.PI).toFixed(2)); if (q.cube) { const c = q.p.getPointAtLength(((q.t + .5) % 1) * q.len); q.cube.setAttribute('x', c.x - 18); q.cube.setAttribute('y', c.y - 3.5); q.cube.setAttribute('transform', `rotate(45 ${c.x - 14.5} ${c.y})`); } });
  place();
  if (!reduce) {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      for (const q of packets) q.t = (q.t + q.speed * dt) % 1;
      place();
      const ph = (now / 2400) % 1; pulse.setAttribute('r', 26 + ph * 40); pulse.setAttribute('opacity', (1 - ph) * .5);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const usd = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
  /** Feed it /api/state. Status text reflects the real result, never an implied confirmation. */
  return function update(s) {
    if (s.reserves) for (const c of ['ethereum', 'solana', 'cardano']) {
      const rows = (s.reserves.rows ?? []).filter((r) => r.chain === c);
      if (rows.length) labels[c].textContent = `${usd(rows.reduce((t, r) => t + (r.usdValue ?? 0), 0))} · ${new Set(rows.map((r) => r.holder)).size} addr`;
    }
    const R = s.reserves?.pricedUsd, L = s.liabilities?.exposedUsd, a = s.ratio?.published;
    if (R && L) {
      const m = Math.max(R, L);
      pRes.v.textContent = usd(R); pRes.bar.setAttribute('width', (108 * R / m).toFixed(1));
      pLia.v.textContent = usd(L); pLia.bar.setAttribute('width', (108 * L / m).toFixed(1));
    }
    if (a) {
      const st = a.status === 'Needs review' ? 'RECONCILING' : String(a.status).toUpperCase();
      const ok = a.status === 'Balanced';
      status.textContent = `${(a.ratio * 100).toFixed(2)}% · ${st}`;
      sub.textContent = ok ? 'RESERVES MATCH LIABILITIES' : 'RESERVES VS LIABILITIES';
      mark.setAttribute('opacity', ok ? 1 : 0);
      ring.setAttribute('stroke', ok ? '#c7c2ff' : '#e8c46a'); pulse.setAttribute('stroke', ok ? '#c7c2ff' : '#e8c46a');
    }
  };
}
