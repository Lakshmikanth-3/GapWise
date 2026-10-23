# ZeroGap: project status report

**As of:** Friday 23 October 2026, evening IST · **Status:** submitted to the Strike Hackathon · release `v1.0`
**Live:** https://zerogap-strike.vercel.app · **Code:** https://github.com/Lakshmikanth-3/ZeroGap · **Alerts:** https://t.me/zerogap_alerts · **Demo:** https://youtu.be/UTykbSh0ySg

ZeroGap is an independent, read-only proof-of-solvency and safety monitor for Strike Finance. It reads Strike's
lockers on Ethereum, Solana and Cardano, counts what Strike owes every trader, and shows the gap live. It is not
affiliated with Strike Finance.

## 1. Latest result

| | USD |
| --- | --- |
| Reserves: Ethereum, Solana, Cardano lockers | $1,696,613 |
| + Strike market-maker bot on Aster (+ Lighter), **disclosed by Strike** | $34,197 |
| **Reserves total** | **$1,730,810** |
| Account equity (wallet_balance + unrealized_pnl) | $632,637 |
| + depositors' vault shares | $1,080,910 |
| + staking rewards | $31,943 |
| + commission | pending (not exposed by Strike) |
| **Liabilities total** | **$1,745,490** (3,487 accounts, 0 failed) |
| **Ratio** | **99.16%, gap −$14,680 (−0.84%), "Drift"** |

The gap went from −$63.7K to −$14.7K as the investigation with Strike's founder progressed. Strike says the rest is
bridge funds being returned today; ZeroGap re-runs automatically.

## 2. What is built and working

| Area | Status | Evidence |
| --- | --- | --- |
| M1 Reserves on 3 chains | ✅ Live | Ethereum vault (USDC + aEthUSDC), Solana vault + USDC account + treasury, both Cardano scripts. Every token matched the explorers exactly (T1.6). |
| Prices | ✅ | Strike price index (ADA/ETH/SOL), Strike Credit API (sUSDrf, LP, aUSDC), 1:1 stablecoins; iUSD at a labelled $1 placeholder. |
| M2 Liabilities + ratio + flow match | ✅ Live | ~3,480 accounts and sub-accounts read every scan, 0 failed; vault cross-check matches within $3. |
| M3 Safety monitor + Telegram alerts | ✅ Live | Pauses, queues, timelocks, rate limits, flow mismatches; alerts delivered to @zerogap_alerts. |
| M4 My Safety (Builder Connect) | ✅ | Wallet connect, own balance, withdrawal to own wallet; real testnet withdrawal proven. Builder code `zerogap`. |
| Verify it yourself | ✅ | `npm run verify` (no keys), JSON report with SHA-256 and code commit; hourly reports on the `reports` branch. Fresh-clone check passed (T6.6). |
| Testnet view | ✅ | Dashboard Mainnet/Testnet switch (Sepolia, Solana devnet, Cardano preprod). |
| Website | ✅ | Monochrome 3D redesign (particle rock, cube, ripple floor, scroll animations, Geist fonts); landing, dashboard, My Safety, Legal pages. |
| Engine hosting | ✅ | GitHub Actions run loops a scan every 5 min for ~5.5 h, then restarts itself; data published to `zerogap-data`, served by Vercel. |
| README | ✅ | Hackathon summary, judging-criteria table, 3 Mermaid diagrams, formula, addresses, rules. |

## 3. Quality

- Unit and integration tests: **112/112 pass** (incl. MM-bot signing, relayed flows); type check clean.
- End-to-end (Playwright) against production: **9/9 pass**.
- Manual checks: **T1.6 passed** (explorers match); **T2.9** found the isolated-margin issue, fixed with the founder.
- T4.5 Telegram delivery passed; T4.6 no duplicate alerts in the published log (two duplicates were sent on 23 Oct
  when a local run overlapped a GitHub run; local engine runs have stopped).
- Secrets: none in the repo or its history; keys only in `.env` and GitHub secrets.

## 4. Key findings (all confirmed with Strike's founder)

1. **Isolated margin (DECISIONS #50):** `margin_balance` left out ~$79K of isolated-margin positions. Liabilities now use
   account equity = wallet_balance + unrealized_pnl.
2. **No double counting (DECISIONS #51, docs/GAP-INVESTIGATION.md):** subs are not inside masters, staking is not inside
   wallet_balance, vault shares are not inside depositors' wallets; our equity matches Strike's leaderboard.
3. **Relayed deposits (DECISIONS #53):** deposits from Solana, base, bsc, polygon … arrive in the Ethereum locker via a
   relayer; the flow match now counts them (22 Oct: 99.99%).
4. **Market-maker bot (DECISIONS #54):** the other side of traders' net positions sits with Strike's MM bot on Aster. It
   is a separate, disclosed reserve line, read with read-only API access provided by Strike (keys only in env/secrets).

## 5. Open items

| Item | Owner | Status |
| --- | --- | --- |
| Bridge funds being returned (remaining −$14.7K) | Strike | In progress today |
| Commission balances: public source | Strike | Pending, shown as a pending line |
| iUSD price source ($5.7K at $1 placeholder) | Strike | Pending |

## 6. Submission

- ✅ Submitted through Strike's form · ✅ demo video https://youtu.be/UTykbSh0ySg · ✅ release `v1.0`
- Keep the "ZeroGap engine" workflow running through judging (it restarts itself every ~5.5 h).

## 7. Links

| What | Where |
| --- | --- |
| Live site / dashboard | https://zerogap-strike.vercel.app · /dashboard · /me · /legal |
| Live JSON / latest report | /api/state · /api/report |
| Scan history | `reports` branch |
| Design and decisions | docs/PRD.md, docs/DECISIONS.md (#1–51), docs/PROGRESS.md |
| Checks | docs/MANUAL-CHECKS.md, docs/GAP-INVESTIGATION.md |
