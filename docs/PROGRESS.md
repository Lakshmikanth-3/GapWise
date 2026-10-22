# Progress

## P0 Setup (Thu 22 Oct, 00:10–00:30 IST)

**Built:** repo scaffold (PRD §4), MIT licence, `.env.example`, CI (typecheck + `npm test`), the starter code from §7 with fixes, and
`scripts/first-ratio.ts`, which computes a real ratio.

**Starter-code fixes:** `flowMatch` is re-exported from `ratio.ts`; vault lookups use the full `vault_id`; the scan workers no
longer exit while sub-accounts are still being added; `withRetry` does not sleep after the last try; the JSON import uses `with`
instead of the deprecated `assert`; stablecoins are matched by id, not by name; the Solana reader uses the vault's actual holders.

**Tests:** `npm test` 18/18 green (T0.1, T0.2, T1.2, T2.1, T2.2, T2.5, T2.7, T4.2–T4.4, plus mocked collector and price
fallback tests). `npm run test:live`: T0.3 green. T0.4: ratio 0.856, inside 0.5–2.0.

**First ratio (2026-10-21 18:57 UTC):** reserves $1,579,863.56 (priced) / liabilities $1,846,349.47 = **85.57%**, Exact
(2,982 listed + 474 sub-accounts = 3,456 read, 0 failed, 9 negative).

**Exit gate:** ratio printed, but it is far from 1.0, so per the PRD we investigate before building more. Open items: unpriced
sUSDr plus a CIP-68 token, and the 6,135 vs 3,456 account coverage gap (DECISIONS #4, #7).

## P0 rerun with founder requirements (Thu 22 Oct, ~00:45 IST)

**Changed:** second Cardano script; vault accounts excluded (plus an audit read); ratio status bands (Balanced / Drift /
Needs review); pricing by contract id with no $1 assumed by name, and unpriced assets listed separately; reserves read at
both ends of the scan.

**Tests:** `npm test` 33/33 (adds T1.3, T1.7, T1.8, T2.3, T2.6, T2.10, T2.11, T2.12). Typecheck clean. T0.3 live green.

**Live (2026-10-21 19:15 UTC):** priced reserves $1,577,425; liabilities $776,199 (2,976 listed, 6 vaults excluded,
474 sub-accounts, 3,450 read, 0 failed). **Ratio 203.22%, Needs review.** Audit with vaults: 85.44%.
Unpriced: sUSDr 259,016; iUSD 4,174; CIP-68 token `4de79a0c…` (36.6B units).

**Exit gate: NOT passed.** The vault-exclusion rule conflicts with the data (DECISIONS #11). Waiting on the founder.

## P1 Reserves collectors (Thu 22 Oct, 01:00–01:30 IST)

**Built:** pluggable pricer; `snapshotReserves` (a failed chain is reported, not zeroed); BigInt unit conversions;
liability breakdown (margin + staking rewards + pending referral line); `assessRatio` with an Incomplete state; Postgres
schema and store with a JSONL fallback; 60 s reserves worker; project renamed to ZeroGap.

**Tests:** `npm test` 50/50: T1.1, T1.2, T1.3, T1.4 (Ethereum and Solana RPC fixtures, Koios fixture), T1.7, T1.8, plus pricer,
liabilities and assessment tests. `npm run test:live`: T0.3 and T1.5 (×4) green, each under 2.5 s.
T1.6 (explorer comparison): values come straight from chain RPCs (Ethereum RPC, Koios, Solana RPC) at the addresses linked
in the explorers; still to be repeated by hand on Etherscan, Cardanoscan and Solscan for the demo.

**Live (19:50 UTC):** priced reserves $1,579,733; liabilities exposed $804,705 (margin $772,620 + staking $32,085) +
referral pending; 3,452 accounts read, 0 failed. Published ratio (vaults excluded) 196.31%, Needs review; audit ratio (vaults
included) 84.29%, Incomplete.

**Exit gate:** T1.1–T1.5 pass; reserves stored every 60 s (worker). Passed for P1's scope. The ratio itself still depends on
the founder's answers (vaults, prices, referral).

## P2 Liabilities, ratio and flow match (Thu 22 Oct, 01:30–02:15 IST)

**Built:** `stats.ts` (Strike `/stat/v1/dashboard/transfers` → per day per chain), `flows.ts` (on-chain locker flows:
Ethereum decoded Deposit/Withdraw/AdminWithdraw events; Solana token-balance deltas of the locker's token accounts;
Cardano net value change of both scripts per tx, so internal batches net to zero), `core/flowCheck.ts` (only full days inside
the collector's coverage are compared), `scripts/flow-match.ts`.

**Tests:** `npm test` 54/54 (adds T2.7 and flow parsing/bucketing/coverage). Live: T2.8 full scan (3,452 accounts, 0
failed, ~3 min with 2 calls/account).

**First live flow match (2 days):** Ethereum out 99.3%, in 97.0% (partial-day coverage; keyless RPC only serves ~10k
blocks of logs). Solana and Cardano show real gaps: Cardano reported deposits $42.3k vs $7.7k priced on-chain on 20 Oct,
with 12 unpriced moves (sUSDr/LP) that day. Reported as mismatch, not hidden. See DECISIONS #27.

## P3 Dashboard, P4 Safety monitor and alerts, P5 My Safety (Thu 22 Oct, 02:15–03:30 IST)

**P3 built:** `apps/server` (engine + read-only API) and `apps/web` pages rebuilt from the owner's ZeroGap UI design
(landing, dashboard, my-safety) with every sample number replaced by live data, its source and its timestamp. The ratio history
is an inline SVG chart (instead of Recharts, so there is no React build step). The engine keeps the last good state on disk,
so a failed source shows its previous value plus a warning.
**P3 tests:** Playwright 6/6 against the live server: T3.4 (loads in 1.1 s, all 3 chains, correct explorer links), T3.1,
T3.3 (API outage keeps the last render and flags offline), T3.5 (375 px, no horizontal scroll on all three pages).

**P4 built:** `collectors/safety.ts` (isPaused, pauseEpoch, largeWithdrawalConfig, timelockConfig, rateLimitBucket 1h/24h
per asset and global; the window argument is in hours (1 or 24), verified live; events decoded with the ABI). Rules rewritten
for real events only (no simulation), Telegram sender, persistent de-duplication. Events already on-chain when ZeroGap first
starts are shown but not re-alerted.
Live cross-check: the contract's own 24h USDC bucket (104,180.48 used) equals the 21 Oct outflow the flow match decoded
from Withdraw events (104,180.48).
**P4 tests:** T4.1 (bucket math with live values, open queue/timelock tracking), T4.2 (every rule fires on its trigger,
silent when clean; Needs review / Incomplete never alerted), T4.3, T4.4 (no simulation tag), Telegram format and request.
T4.5 (delivery to a real channel) and T4.6 (1 h clean live run) need the bot token.

**P5 built:** browser Builder Connect client (`apps/web/assets/strike-client.js`): Ed25519 key in the tab only,
request-signature → wallet signs (Phantom base58 / EVM personal_sign / CIP-30 COSE) → verify-signature, then account
value, withdrawable amount (`maxWithdrawAfterRewards`) and checks; withdrawal quote → user signs → `/v2/withdraw`.
Testnet by default. Probed live: testnet `request-signature` answers `builder code not found` for a fake code, so the
endpoint shape is as documented.
**P5 tests:** T5.1 (signing message format; signature verifies with tweetnacl), T5.2 (fresh UUID nonce), T5.6 (secret
never sent), base58 and bech32 encodings (round-trips Strike's real Cardano script address).
T5.3–T5.5 (testnet connect, balances, withdrawal) need the owner's builder code and wallet signature.

**Totals:** `npm test` 75/75 · `npm run test:live` green · Playwright 6/6 · typecheck clean.

## P5 testnet proof (Thu 22 Oct, ~12:00 IST): passed

On https://zerogap-strike.vercel.app/my-safety, Strike **testnet**, builder code `zerogap` (registered on mainnet and testnet,
verified through `/auth/builder/request-signature`), MetaMask wallet `0x43DDBD19381C8Ea8C1e4670d18DdB97c43fbEFDC`:
- T5.3 Connect: request-signature → wallet signature → verify-signature, API wallet created, account id returned. ✅
- T5.4 Balance view: account value ≈ $19.99 after a 20 USDC Sepolia deposit. ✅
- T5.5 Withdrawal: quote → user signs in MetaMask → `/v2/withdraw` accepted, request `71c6a5b2-4e30-415c-846b-2d4d4bcefa3c`,
  status `pending`. ✅ (screen-recorded by the owner)

Note: the first deposit attempt failed on-chain because MetaMask's Smart Account (EIP-7702) bundled approve+deposit
(tx 0x5d88c0e0…731a, reverted; funds were not moved). It worked after switching the Sepolia account back to a standard account.

## P4 live Telegram delivery (Thu 22 Oct, ~20:09 IST): passed

After the GitHub `TELEGRAM_BOT_TOKEN` secret was corrected, engine run #6 delivered the alerts it had held back to the
public channel **@zerogap_alerts**: flow mismatches for Ethereum, Solana and Cardano (per day) and one unusual-outflow alert.
Each has a dashboard link and a UTC timestamp. These are real findings; there is no simulation path. T4.5 ✅.
Earlier, a delivery failure (404 from a malformed secret) exposed a retry bug that created duplicate records. It is fixed:
one record per alert, re-sent once Telegram works.

Also done on 22 Oct: corrected Solana IDL with full program decoding, Strike Credit prices and custody scaling, rewards
discounted (with evidence), known in-transit status, gap in USD and %, one price snapshot per scan, PRD §8–9, `/me` route.
`npm test` 96/96.
