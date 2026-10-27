// Shared site chrome: the pill navigation and the footer, identical on every page.
const REPO = 'https://github.com/Lakshmikanth-3/ZeroGap';
export const MARK = '<img src="/assets/logo.png" alt="" width="30" height="34" style="object-fit:contain">';

const FOOTER = [
  ['Product', [['Dashboard', '/dashboard'], ['My Safety', '/me'], ['Testnet view', '/dashboard?network=testnet'], ['Telegram alerts', 'https://t.me/zerogap_alerts']]],
  ['Resources', [['Docs', `${REPO}#readme`], ['Methodology', '/dashboard#method'], ['API (live JSON)', '/api/state'], ['Latest report', '/api/report?download'], ['Scan history', `${REPO}/tree/reports`]]],
  ['Community', [['GitHub', REPO], ['Telegram', 'https://t.me/zerogap_alerts'], ['Strike Finance', 'https://strikefinance.org'], ['Strike docs', 'https://docs.strikefinance.org/']]],
  ['Legal', [['Terms', '/legal#terms'], ['Privacy', '/legal#privacy'], ['Disclaimer', '/legal#disclaimer'], ['MIT licence', `${REPO}/blob/main/LICENSE`]]],
];

export function brand() {
  return `<a class="brand" href="/" aria-label="GapWise home">${MARK}<b style="font-size: 24px">GapWise</b></a>`;
}

/** Fills <footer class="site"></footer>. */
export function renderFooter(el = document.querySelector('footer.site')) {
  if (!el) return;
  const ext = (h) => (h.startsWith('http') ? ' target="_blank" rel="noopener"' : '');
  el.innerHTML = `<div class="cols">
    <div style="display: flex; flex-direction: column; gap: 22px">${brand()}
      <p style="margin: 0; max-width: 34ch; font-size: 17px; line-height: 1.6; color: var(--mute)">Independent, read-only proof of solvency for Strike Finance. Every locker, every account, checked live.</p>
      <p style="margin: 0; font-size: 13px; color: var(--dim)">Not affiliated with Strike Finance.</p></div>
    ${FOOTER.map(([h, links]) => `<div><h4>${h}</h4><ul>${links.map(([t, href]) => `<li><a href="${href}"${ext(href)}>${t}</a></li>`).join('')}</ul></div>`).join('')}
  </div>
  <div class="copy">GapWise ${new Date().getFullYear()} · open source under the MIT licence</div>
  <div class="word" aria-hidden="true">ZEROGAP</div>`;
}

renderFooter();
