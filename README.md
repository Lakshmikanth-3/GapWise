# ZeroGap

[![CI](https://github.com/Lakshmikanth-3/ZeroGap/actions/workflows/ci.yml/badge.svg)](https://github.com/Lakshmikanth-3/ZeroGap/actions/workflows/ci.yml) [![ZeroGap engine](https://github.com/Lakshmikanth-3/ZeroGap/actions/workflows/scan.yml/badge.svg)](https://github.com/Lakshmikanth-3/ZeroGap/actions/workflows/scan.yml)

**Independent, read-only proof of solvency and safety monitor for [Strike Finance](https://docs.strikefinance.org/)**
(strikefinance.org; not the Bitcoin app "Strike"). Built for the Strike Finance Hackathon, October 2026.

Strike runs matching off-chain on the Strike Node, while custody sits in on-chain lockers. ZeroGap checks both sides live:

- **Reserves (M1):** balances read directly from Strike's lockers: the Ethereum vault, the Solana vault account and its
  treasury, and both Cardano scripts (deposit + protocol). Priced with Strike's own index prices.
- **Liabilities and ratio (M2):** every account from Strike's public API: `margin_balance` minus locked rewards (rewards are tradeable, not withdrawable), with
  sub-accounts included, vault accounts excluded, and ≤ 40 req/s. Strike is not a CEX, so the target is **exactly 100%**.
- **Flow match (M2):** Strike's reported daily deposits and withdrawals per chain vs what actually moved on-chain.
- **Safety monitor (M3):** decoded Ethereum vault events (large-withdrawal queue, pause, timelock, upgrades, roles,
  rate limits, admin withdrawals) plus live `isPaused()`, `largeWithdrawalConfig()` and `rateLimitBucket()`. Telegram alerts
  fire on real events only, with no repeats.
- **My Safety (M4):** connect your wallet with **Strike Builder Connect** (Phantom, MetaMask/Rabby or a CIP-30 Cardano wallet),
  see your balance and withdrawable amount next to the platform ratio, and withdraw by signing in your own wallet.

Every number on the site shows its source and timestamp. Nothing is simulated or estimated: unpriced assets and
liabilities Strike does not expose yet are shown as separate lines, never folded in.

## Run it (4 commands)

```bash
git clone https://github.com/Lakshmikanth-3/ZeroGap && cd ZeroGap
npm install
cp .env.example .env        # add your keys (see below)
npm start                   # http://localhost:8787
```

Pages: `/` landing · `/dashboard` live dashboard · `/my-safety` Builder Connect. API: `/api/state`, `/api/history`,
`/api/config`, `/api/health`.

Other commands: `npm run first-ratio` (one full scan, printed) · `npm run flow-match -- 7` · `npm test` (unit and mocked
integration, CI) · `npm run test:live` (mainnet smoke) · `npm run test:e2e` (Playwright against a running server).

### Keys (`.env`)

| Variable | Needed for | Without it |
| --- | --- | --- |
| `STRIKE_BUILDER_CODE` | My Safety (Builder Connect) | Connect is disabled and the page says why |
| `ETH_RPC_URL` (Alchemy) | Full Ethereum log history for flow match | Public RPC: about 10k blocks of logs, so recent days only |
| `SOLANA_RPC_URL` (Helius) | Faster Solana reads | Public RPC (rate-limited) |
| `BLOCKFROST_PROJECT_ID` | Cardano reads | Koios public API (same on-chain data) |
| `DATABASE_URL` (Supabase) | Postgres history; run `packages/db/schema.sql` once | Local `data/*.jsonl` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alert delivery | Alerts are recorded and shown on the dashboard as "not sent" |

## How the ratio is computed

```
ratio = Σ(locker balance × price) ÷ (Σ margin_balance − Σ lockedRewards)   [non-vault accounts + sub-accounts]
```

- **Prices:** Strike `GET /price/v2/premiumIndex` index price for ADA/ETH/SOL. Fiat-redeemable stablecoins (USDC, USDT,
  USDCx, USDM), identified by contract, never by name, use the 1:1 peg and are labelled `peg`. sUSDr, iUSD and the
  SundaeSwap USDCx/USDM LP token have their own official Strike prices that are not public yet, so they are listed as
  **unpriced** and left out of the ratio. Pricing is pluggable (`packages/collectors/prices.ts`), so each new price source
  is one adapter.
- **Liabilities:** account list from `GET /stat/v1/stats/leaderboard` (ids only, since its balances lag). Each account is read live
  with `GET /v2/account` and `GET /v2/balances`. Vault accounts are excluded per Strike's founder: a depositor's vault share is
  in their own account value. The vault total is still read and logged as an audit line.
- **Status bands:** **Balanced** within ±0.01% · **Drift** 0.01–1% · **Needs review** beyond 1%, which is logged for
  investigation and never published or alerted as insolvency. A gap that components Strike does not expose yet could
  explain shows as **Incomplete**.
- **Timing:** a full scan takes about 3 minutes while balances keep moving. Reserves are read right after each scan, and both
  sides are stored with the scan window, so a tiny drift can be timing alone.

## Current status (honest limits)

- The published ratio is **Needs review**. With vault accounts excluded (the founder's rule), reserves are about 2× the
  exposed liabilities. With the vaults included, the priced reserves cover about 84%, and the unpriced sUSDr, iUSD and LP
  (about $300k) would bring it close to 100%. The evidence is in `docs/DECISIONS.md` #11 and #23; this is waiting on Strike.
- Referral rewards (about $25K) are not exposed by Strike yet, so they are shown as a pending line.
- The Solana IDL in the repo is Strike's example file, so Solana is read for balances only. Its pause state is not decoded yet.
- Flow match: Ethereum matches 97–99% on the days covered. Cardano deposits don't match yet (likely unpriced token
  moves); the mismatch is shown, not hidden.

## Architecture

```
packages/collectors   ethereum · solana · cardano · accounts · prices · stats · flows · safety
packages/core         ratio bands · liabilities · valuation · flow check · rate limiter · units   (pure, unit-tested)
packages/alerts       rules · telegram
packages/db           schema.sql · Postgres / JSONL store
apps/server           engine (scheduled jobs, last-good state) + read-only HTTP API + static pages
apps/web              landing · dashboard · my-safety (vanilla JS, ZeroGap design)
```

Security: the server is read-only (GET only). For My Safety, the Ed25519 API-wallet key is generated in the browser and never
leaves the tab; Strike's API allows CORS, so the browser talks to Strike directly. Strike only pays withdrawals to the wallet
you connected with, and each one needs your own wallet signature.

## Deploy

**Docker** (Railway, Render, Fly or any VPS): `docker build -t zerogap . && docker run -p 8787:8787 --env-file .env zerogap`.
The engine runs inside the same process, so one always-on instance is enough. Set `PUBLIC_URL` to the public address so
Telegram alerts link to the dashboard. Vercel alone is not a fit for the always-on engine.

## Docs

`docs/PRD.md` (plan) · `docs/DECISIONS.md` (every deviation and finding) · `docs/PROGRESS.md` (phase log and test results) ·
`docs/design/ZeroGap UI.html` (design reference).

## Licence

MIT
