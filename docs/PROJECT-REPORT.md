# ZeroGap: project status report

**As of:** Friday 23 October 2026, ~10:00 UTC (15:30 IST) · **Submission deadline:** 23 Oct, 10:00 AM EST (7:30 PM IST)
**Live:** https://zerogap-strike.vercel.app · **Code:** https://github.com/Lakshmikanth-3/ZeroGap · **Alerts:** https://t.me/zerogap_alerts

ZeroGap is an independent, read-only proof-of-solvency and safety monitor for Strike Finance. It reads Strike's
lockers on Ethereum, Solana and Cardano, counts what Strike owes every trader, and shows the gap live. It is not
affiliated with Strike Finance.

## 1. Latest result

| | USD |
| --- | --- |
| Reserves (all lockers, one price snapshot) | $1,783,392 |
| Liabilities: account equity (wallet_balance + unrealized_pnl) | $728,863 |
| + depositors' vault shares | $1,086,256 |
| + staking rewards | $31,953 |
| + commission | pending (not exposed by Strike) |
| **Liabilities total** | **$1,847,071** |
| **Ratio** | **96.55%, gap −$63,679**, shown as **"Under review with Strike"** |

The founder says −$63K looks too large. Our account-by-account audit found **no double counting** (details in
section 4). The gap is almost exactly traders' **net unrealized profit (+$33.7K)** plus **staking rewards ($32.0K)**.
Without both, the ratio is **100.11%**. Questions for Strike are open (section 5).

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

- Unit and integration tests: **112/112 pass**; type check clean.
- End-to-end (Playwright) against production: **9/9 pass**.
- Manual checks: **T1.6 passed** (explorers match); **T2.9** found the isolated-margin issue, fixed with the founder.
- T4.5 Telegram delivery passed; T4.6 no duplicate alerts in the published log (two duplicates were sent on 23 Oct
  when a local run overlapped a GitHub run; local engine runs have stopped).
- Secrets: none in the repo or its history; keys only in `.env` and GitHub secrets.

## 4. Key findings so far

1. **Isolated margin (DECISIONS #50):** `margin_balance` left out $77K of isolated-margin positions in 46–47
   accounts. Founder confirmed the fix: liabilities use account equity = wallet_balance + unrealized_pnl.
2. **Gap audit (DECISIONS #51, docs/GAP-INVESTIGATION.md):**
   - Sub-accounts are not inside masters (master + subs = leaderboard equity exactly).
   - Staking is not inside wallet_balance (502 accounts hold less in wallet than in staking).
   - Vault shares are not inside depositors' wallets.
   - Our equity matches Strike's leaderboard for the top accounts.
   - Traders' net unrealized PnL is +$33.7K; its losing side is not in any scanned account. One account alone has
     +$32K unrealized.

## 5. Open items

| Item | Owner | Status |
| --- | --- | --- |
| Counterparty of the +$33.7K net unrealized PnL (market maker / LP / house accounts?) | Strike (Shan) | Asked |
| Where staking rewards ($32K) are backed (perps lockers or a separate staking wallet?) | Strike (Shan) | Asked |
| Commission balances: public source | Strike | Pending, shown as a pending line |
| iUSD price source ($5.7K at $1 placeholder) | Strike | Pending |
| 3D object to replace the stone on the landing page | Owner | Waiting for reference image |

## 6. Remaining steps to submit

1. **Demo video:** a narrated version (pitch first, then demo) is scripted; the last rendered file is
   `C:\HACK\ZeroGap-demo.mp4`. Re-render with the latest site, check, and upload to YouTube (Unlisted).
2. Add the video link to the README, then tag **v1.0**.
3. Submit through Strike's Google Form before **7:30 PM IST**: repo, live site, video, README summary, category
   "Data and analytics".
4. Keep the GitHub engine running through judging (start "ZeroGap engine" from the Actions tab if it is idle).

## 7. Links

| What | Where |
| --- | --- |
| Live site / dashboard | https://zerogap-strike.vercel.app · /dashboard · /me · /legal |
| Live JSON / latest report | /api/state · /api/report |
| Scan history | `reports` branch |
| Design and decisions | docs/PRD.md, docs/DECISIONS.md (#1–51), docs/PROGRESS.md |
| Checks | docs/MANUAL-CHECKS.md, docs/GAP-INVESTIGATION.md |
