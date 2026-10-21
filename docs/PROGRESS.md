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
