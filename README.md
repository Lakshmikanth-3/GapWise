# Strike Watchtower

An independent, read-only proof-of-solvency and safety monitor for **Strike Finance** (strikefinance.org; not the Bitcoin app "Strike").
It reads the three locker contracts on-chain (Ethereum, Cardano, Solana), prices them with Strike's own price feed, and sums every
account's `margin_balance` from Strike's public API to get liabilities.

## Setup

```bash
git clone <repo> && cd strike-watchtower
npm install
cp .env.example .env      # optional: works with keyless public RPCs
npm run first-ratio
npm test
```

## Formula

`reserve ratio = Σ(locker balance × Strike indexPrice, stablecoins = 1.00) ÷ Σ margin_balance over every account and sub-account`

Data sources: `GET /stat/v1/stats/leaderboard` (account list), `GET /v2/account` (liabilities), `GET /price/v2/premiumIndex` (prices).

## First recorded ratio (T0.4)

2026-10-21 18:57 UTC: **85.57%** (Exact: 3,456 accounts read, 0 failed). This is preliminary. About $259k of `sUSDr` and one other
Cardano token are not priced yet, and account coverage is being confirmed with Strike. See `docs/DECISIONS.md`.

## Licence

MIT
