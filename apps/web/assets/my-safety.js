import { $, esc, usd, pct, short, ago, getJSON, CHECK, CROSS, WAIT } from './common.js';
import { StrikeClient, WALLETS } from './strike-client.js';

const ASSETS = { solana: ['USDC', 'SOL'], ethereum: ['USDC', 'ETH'], cardano: ['ADA', 'USDM'] };
let config, network = 'testnet', client, session; // session = { chain, address, wallet, accountId }

const log = (m) => { $('log').textContent += `${new Date().toISOString().slice(11, 19)} ${m}\n`; };
const fail = (el, e) => { $(el).innerHTML = `<div class="note red">${esc(e.message ?? e)}</div>`; log(`ERROR ${e.message ?? e}`); };

function setNetwork(n) {
  if (session) { if (!confirm('Switching network disconnects this session. Continue?')) return; location.reload(); }
  network = n;
  $('net-testnet').classList.toggle('on', n === 'testnet');
  $('net-mainnet').classList.toggle('on', n === 'mainnet');
  client = new StrikeClient(n === 'testnet' ? config.strikeTestnetApi : config.strikeApi, window.nacl);
  log(`network ${n} → ${client.base}`);
}

function renderWallets() {
  $('wallets').innerHTML = Object.entries(WALLETS).map(([id, w]) =>
    `<button class="btn walletbtn" data-w="${id}" ${w.available() ? '' : 'disabled title="Wallet extension not detected"'}>${esc(w.label)}${w.available() ? '' : ' · not detected'}</button>`).join('');
  for (const b of document.querySelectorAll('[data-w]')) b.onclick = () => connect(b.dataset.w);
  if (!config.builderCode) $('connect-err').innerHTML = '<div class="note red">STRIKE_BUILDER_CODE is not configured on this ZeroGap server, so Builder Connect cannot start. Add it to .env and restart.</div>';
}

async function connect(id) {
  $('connect-err').innerHTML = '';
  try {
    if (!config.builderCode) throw new Error('Builder code not configured');
    const w = WALLETS[id];
    log(`connecting ${w.label}`);
    const wallet = await w.connect();
    log(`wallet address ${wallet.address}`);
    const publicKey = client.newApiWallet(); // Ed25519 pair generated in this tab; private key never leaves memory
    const ch = await client.requestSignature({ address: wallet.address, chain: w.chain, code: config.builderCode, fee_share_bps: config.builderFeeBps, public_key: publicKey });
    log(`challenge nonce ${ch.nonce}`);
    const wallet_signature = await wallet.signMessage(ch.message_to_sign);
    const v = await client.verifySignature({ address: wallet.address, chain: w.chain, nonce: ch.nonce, wallet_signature });
    log(`verified: account ${v.account_id}, api wallet ${v.api_wallet_id}`);
    session = { chain: w.chain, address: wallet.address, wallet, accountId: v.account_id, label: wallet.label ?? w.label };
    $('who').style.display = 'inline-flex';
    $('who').innerHTML = `<svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="${w.chain === 'solana' ? '#9B7BFF' : w.chain === 'ethereum' ? '#8EA2FF' : '#60A5FA'}"/></svg>${esc(session.label.split(' ')[0])} · ${esc(short(wallet.address))} · ${network}`;
    $('connect').style.display = 'none';
    $('account').style.display = 'flex';
    $('asset').innerHTML = ASSETS[w.chain].map((a) => `<option>${a}</option>`).join('');
    await refresh();
    setInterval(refresh, 30000);
  } catch (e) { fail('connect-err', e); }
}

async function refresh() {
  try {
    const [acct, bals, state] = await Promise.all([client.account(session.accountId), client.balances(session.accountId), getJSON('/api/state')]);
    const b = bals[0] ?? {};
    const upnl = Number(acct.unrealized_pnl ?? 0), value = Number(acct.wallet_balance) + upnl, wd = Number(b.maxWithdrawAfterRewards ?? b.maxWithdrawAmount ?? 0);
    const staking = Number(b.stakingRewardBalance ?? 0);
    $('a-value').textContent = usd(value, 2);
    $('a-value-sub').textContent = `Includes ${usd(upnl, 2)} unrealized PnL${staking ? ` · plus ${usd(staking, 2)} staking rewards` : ''} · ${network}`;
    $('a-wd').textContent = usd(wd, 2);
    $('a-wd-sub').textContent = `${usd(Math.max(0, value - wd), 2)} held as margin or locked · source /v2/balances`;
    if (!$('amt').value) $('amt').value = Math.max(0, wd - 1).toFixed(2);
    $('title').textContent = value > 0 ? 'Here is how your funds are backed' : 'Your account is connected';
    $('subtitle').textContent = `Checked against Strike's on-chain lockers · platform scan ${ago(state.ratio?.ts)}.`;
    const a = state.ratio?.published;
    $('a-ratio').textContent = a ? (a.status === 'Needs review' ? 'Under review with Strike' : pct(a.ratio, 2)) : '…';
    $('a-ratio').style.color = a?.status === 'Balanced' ? 'var(--green)' : 'var(--amber)';
    $('a-ratio-sub').textContent = a ? `${a.status}${a.explainedBy ? ` · ${a.explainedBy}` : ''}` : 'first scan running';
    renderChecks(state, wd);
  } catch (e) { log(`refresh failed: ${e.message}`); }
}

async function renderChecks(state, wd) {
  const rows = [];
  // 1) Is this account in the public account list ZeroGap sums? (leaderboard lookup by account id; mainnet only)
  if (network === 'mainnet') {
    try {
      const r = await fetch(`${config.strikeApi}/stat/v1/stats/leaderboard?limit=1&addresses=${encodeURIComponent(session.accountId)}`).then((x) => x.json());
      const listed = (r.entries ?? []).some((e) => e.account_id === session.accountId);
      rows.push([listed ? CHECK : WAIT, listed ? 'Your account is in the account list ZeroGap sums as liabilities' : 'Your account is not in the public leaderboard snapshot yet (new accounts appear after the next snapshot)']);
    } catch { rows.push([WAIT, 'Could not check the public account list right now']); }
  } else rows.push([WAIT, 'Liability inclusion is checked on mainnet (this session is on testnet)']);
  // 2) Does the locker on your chain hold enough to pay this withdrawal?
  const res = state.reserves?.rows?.filter((r) => r.chain === session.chain && r.usdValue !== undefined) ?? [];
  const lockerUsd = res.reduce((x, r) => x + r.usdValue, 0);
  if (state.reserves) rows.push([lockerUsd >= wd ? CHECK : CROSS, `${session.chain[0].toUpperCase() + session.chain.slice(1)} locker holds ${usd(lockerUsd)} in priced assets (mainnet, read ${ago(state.reserves.ts)})${lockerUsd >= wd ? ', enough to pay you out' : ', less than your withdrawable amount'}`]);
  // 3) Safety controls
  const sf = state.safety;
  if (sf) {
    rows.push([sf.paused ? CROSS : CHECK, `Ethereum vault ${sf.paused ? 'is PAUSED' : 'not paused'} · 24h USDC withdrawal limit ${sf.usdc24h.usedPct.toFixed(1)}% used`]);
    rows.push([sf.largeWithdrawal.pendingCount ? WAIT : CHECK, `${sf.largeWithdrawal.pendingCount} large withdrawal(s) queued · timelock ${Math.round(sf.timelock.delaySecs / 3600)} h on contract changes`]);
  }
  $('checks').innerHTML = rows.map(([i, t]) => `<div class="check">${i}<span>${esc(t)}</span></div>`).join('');
}

async function withdraw() {
  $('wd-out').innerHTML = '';
  const btn = $('wd-btn');
  try {
    const amount = Number($('amt').value);
    if (!(amount >= 5)) throw new Error('Minimum withdrawal is $5');
    btn.disabled = true;
    const q = await client.withdrawQuote({ usd_value: amount.toFixed(2), blockchain: session.chain, asset: $('asset').value });
    log(`quote ${q.withdraw_id} fee ${q.fee}`);
    if (q.tx_cbor) throw new Error('This Cardano withdrawal needs a funding transaction signature (tx_cbor), which ZeroGap does not build. Use app.strikefinance.org for this one.');
    $('wd-out').innerHTML = `<div class="note">Quote ${esc(q.withdraw_id)} · fee ${usd(Number(q.fee), 2)}<br>Sign this in your wallet:<br><span class="mono">${esc(q.message_to_sign)}</span></div>`;
    const wallet_signature = await session.wallet.signMessage(q.message_to_sign);
    const r = await client.withdraw({ withdraw_id: q.withdraw_id, wallet_signature });
    log(`withdraw ${r.request_id} status ${r.status}`);
    $('wd-out').innerHTML = `<div class="note" style="background:var(--greenbg);border-color:#1F4A38;color:var(--green2)">Withdrawal submitted · request <span class="mono">${esc(r.request_id)}</span> · status <b>${esc(r.status)}</b> (${network}). Strike sends it to ${esc(short(session.address))}.</div>`;
    setTimeout(refresh, 3000);
  } catch (e) { fail('wd-out', e); }
  finally { btn.disabled = false; }
}

config = await getJSON('/api/config');
setNetwork('testnet');
$('net-testnet').onclick = () => setNetwork('testnet');
$('net-mainnet').onclick = () => setNetwork('mainnet');
$('wd-btn').onclick = withdraw;
renderWallets();
setTimeout(renderWallets, 800); // wallet extensions inject late
