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
