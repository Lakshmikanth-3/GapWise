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

`reserve ratio = Σ(locker balance × price) ÷ Σ margin_balance over every non-vault account and sub-account`

Price: Strike `indexPrice` for ADA/ETH/SOL; 1:1 peg only for fiat-redeemable stables identified by contract id (labelled `peg`); everything else is listed as unpriced.

Data sources: `GET /stat/v1/stats/leaderboard` (account list), `GET /v2/account` (liabilities), `GET /price/v2/premiumIndex` (prices).

## Ratio rules

Strike is not a CEX, so reserves should equal liabilities exactly. Status: **Balanced** (within 0.01%), **Drift** (0.01–1%),
**Needs review** (over 1%; never published or alerted as insolvency). A result over 100% is as suspicious as one under 100%.

**Timing:** a full account scan takes about 90 s while balances keep moving, so a tiny drift can be timing alone. Reserves are
read at both the start and the end of each scan, and the scan window is stored with the ratio.

## Status

P0 complete; ratio still **Needs review** pending founder confirmation of vault accounting and of the sUSDr price source (see `docs/DECISIONS.md`).

## Licence

MIT
