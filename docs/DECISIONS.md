# Decisions and deviations from the PRD

## 2026-10-22 (P0, from live calls)

1. **Price feed endpoint.** Confirmed from llms.txt → `api/market/rest-api/prices.md`:
   `GET {STRIKE_API}/price/v2/premiumIndex` (no symbol = all). Rows: `{ symbol: "ADA-USD", indexPrice, markPrice, time }`.
   We use `indexPrice`.
2. **Leaderboard shape.** `GET /stat/v1/stats/leaderboard` returns `{ data_notes, entries, time_range, total, updated_at }`
   with 2,982 entries. Vault rows have `account_id = "vault_<8hex>"` and the full UUID in `vault_id`.
   The PRD starter queried `/v2/account?vault_id=<8hex>`. That returns `{"error":"invalid vault_id"}`, so we now pass the full `vault_id`.
3. **Account shape.** `/v2/account` has `margin_balance` and `sub_accounts` as the PRD says. Vault responses add
   `custody_balances`, `inventory_costs_usd`, `conversion_reserved_usd` and `slp_adl` (not used yet).
   The scan found 474 sub-accounts that are not listed in the leaderboard on their own, so sub-accounts must be added from responses (open item answered).
4. **Coverage gap (open).** `/stat/v1/dashboard/summary.total_users` = 6,135 trading accounts, but the leaderboard plus
   sub-accounts gives 3,456. Accounts that have never traded may be missing from the leaderboard. **Ask Shan.**
5. **Solana locker.** `Dj9NkHy…` is a 2,043-byte data account owned by program `7XASQ24f…`. That is the same program id as
   the "example" IDL, and its discriminator `d308e82b02987577` equals the IDL's `Vault` account. Funds:
   - USDC token account `BT85fgyh…` is owned by the vault account itself (7,173 USDC).
   - Treasury PDA `["treasury", vault]` = `H4nZyX3qGQwGH6wQn8G53uZ6LX8TqPZDakCN2M54icSH` holds only about 0.001 SOL.
   We read SPL tokens owned by both and SOL from the treasury. We use only the IDL's PDA seed, not account
   decoding or logs. Re-check this when the corrected IDL arrives.
6. **Stablecoins are identified by contract or policy id, never by name.** Anyone can send a token called "USDM" to
   a script address. Cardano: USDCx `1f3aec8b…`, USDM `c48cbb3d…`, iUSD `f66d78b4…`.
   `STRIKE_V21_PROTOCOL` (`43dfa7d0…`) is a protocol state token and is excluded.
7. **Unpriced Cardano assets (open).** `sUSDr` (`7d9e4a0e…`, 259,016 units) and a CIP-68 token (`4de79a0c…`, 36.6B units,
   0 decimals per Koios) have no Strike price. They stay unpriced and flagged, not guessed. **Ask Shan** what they are and how
   Strike values them.
8. **Keyless fallbacks.** With no keys set: publicnode for Ethereum, api.mainnet-beta for Solana, Koios for Cardano.
   The real providers are used once keys are set in `.env`.
9. **Ethereum tokens.** For now we check balances of a fixed list of known token contracts (USDC, USDT, DAI, WETH, USDe, PYUSD).
   Only USDC is non-zero, and the locker holds 0 ETH. TODO P1: discover tokens from `AssetWhitelisted` events.
10. **Node 22 locally.** CI pins Node 20 as the PRD says.

## 2026-10-22 (P0 rerun, after founder requirements)

11. **Vault accounts excluded per Shan, but the live data disagrees (OPEN, blocking).** The 6 vault accounts hold
    $1,069,984 of `margin_balance` (the SLP vault alone ~$1.01M). Accounts with big net vault deposits show about $0 of their own
    `margin_balance`. Examples: `019ed9c8…` net $143,848 in vaults, margin $0.004; `019d9c84…` net $99,993, equity $0.
    So vault shares are **not** inside depositors' balances, at least not in `/v2/account.margin_balance`. Results:
    - excluding vaults (as instructed): 203.22%, "Needs review"
    - including vaults: 85.44% on priced assets. Valuing sUSDr + iUSD (263,190 units) near $1 would bring it to about 99.7%.
    We keep the founder's rule as the default. Each scan also reads the vault accounts and logs an audit ratio. Neither is published.
12. **Stablecoins.** No price is assumed from a token's name. Only fiat-redeemable stables, identified by contract / mint /
    policy (USDC, USDT, USDCx, USDM), use the 1:1 peg, and each row carries `priceSource: 'peg'`. Strike's feed has no
    stablecoin symbols. sUSDr, iUSD (a synthetic) and any LP token stay unpriced until a price source is confirmed.
    The on-chain name is `sUSDr`; the prompt says `sUSDrf`. Same asset assumed (policy `7d9e4a0e…`).
13. **Second Cardano script** `addr1w9m5m4v8…` added: 2 ADA + 140 USDM at the time of the first read.
14. **Solana.** Reading SOL + SPL of `Dj9NkHy…` as instructed (7,173 USDC + 0.084 SOL). We also do a balance-only read of the
    treasury PDA (0.00095 SOL). Conflict to resolve: on-chain, `Dj9…` *is* owned by `7XASQ24f…` (the "example" IDL's program)
    and has the `Vault` discriminator. No decoding until the corrected IDL arrives.
15. **Test IDs T1.7, T1.8 and T2.10–T2.12** are not defined in docs/PRD.md (there is no "Required extra tests" section in the
    repo copy). Defined from the prompt: T1.7 both Cardano scripts counted; T1.8 no $1 assumed by name, unpriced listed
    separately; T2.10 vaults excluded; T2.11 status bands; T2.12 scan timestamped (start and end).
16. **Timing.** A scan takes about 90 s. Reserves are read at both the start and the end of the scan. They moved about $124
    (about 0.008%) during one scan.

## 2026-10-22 (P1)

17. **Project renamed to ZeroGap** (repo github.com/Lakshmikanth-3/ZeroGap) at the owner's request.
18. **Pluggable pricing** (`packages/collectors/prices.ts`): `getPrice(asset) → {usd?, source, ts, status}`, built from adapters
    tried in order: strike-feed (ADA/ETH/SOL and WETH, matched by contract), peg (fiat-redeemable stables, matched by contract),
    pending (sUSDr, iUSD, LP USDCx/USDM → `unpriced`), unknown (→ `unpriced`). Strike's official sUSDr/LP price API becomes one
    new adapter placed before `pending`. We build no pricing of our own for these assets.
19. **Token `4de79a0c…` identified**: a CIP-68 "333" fungible LP token of a SundaeSwap-v3-style **USDCx/USDM** pool. The pool
    datum names the pair (USDCx `1f3aec8b…`, USDM `c48cbb3d…`) and 852.3B LP tokens in circulation. The pool holds
    179,499 USDCx and 685,900 USDM. Strike holds 36.62B LP (4.297%), worth about 7,713 USDCx + 29,474 USDM ≈ $37.2k by
    look-through. That figure is for identification only; the LP stays `pending` until Strike's official price API is out.
20. **Liabilities = margin_balance + stakingRewardBalance + referral rewards (pending).** `/v2/balances?account_id=` was
    confirmed in the docs: `stakingRewardBalance` is "segregated…; excluded from margin and withdrawals", so it is added
    (live: $32,085). The scan makes 2 calls per account on one shared 40 req/s limiter, so a full scan takes about 3 min.
    Referral rewards (~$25K per the founder) are a `pending` line: shown, never added. TODO adapter.
21. **lockedRewards (undetermined, ask the founder).** Σ $3,756.60 across 606 accounts. Test used: if lockedRewards is inside
    walletBalance, then `maxWithdrawAmount − maxWithdrawAfterRewards = lockedRewards`. That held for 1 account and failed for 605,
    where the two withdraw figures are equal. Logged only, not added.
22. **Ratio assessment with pending components** (`assessRatio`): a shortfall while reserves are still unpriced, or a surplus
    no bigger than the pending-liability estimate, is shown as **Incomplete** (never Drift / Needs review, never green, never an
    alert). Larger gaps are still banded normally.
23. **Vault evidence update (live 19:50 UTC):** with vaults excluded, 196.31% (Needs review). With vaults included, 84.29% on
    priced reserves; the gap is about $294k, and the unpriced reserves (sUSDr 259k + iUSD 4k + LP ~37k) are about $300k, which
    would put it near 100.3%. The founder's rule remains the published one; both ratios are logged on every run.
24. **Account coverage (6,135 vs 3,452), investigated:**
    - Summary docs: `total_users` = "trading accounts, excluding vault accounts". The leaderboard is not traders-only either:
      1,252 entries have 0 trades and 852 have neither trades nor deposits.
    - Leaderboard 24h/7d/30d/all_time: 678 / 818 / 1,733 / 2,984 entries; the union adds 0 accounts beyond all_time.
    - Solana depositors: 300 recent USDC-locker transactions → 25 fee payers. 23 are on the leaderboard; 1 is not and holds
      **$0**; 1 (226 txs) has no Strike account (likely the relayer).
    - Cardano depositors: not usable. 5,747 deposit-script transactions have only 6 distinct wallet input addresses, because
      deposits are batched.
    - Ethereum `Deposit` events need an archive or getLogs RPC (publicnode, drpc and 1rpc all refuse). The script
      `scripts/investigate-eth-deposits.ts` will run once `ETH_RPC_URL`/`LOGS_RPC_URL` (Alchemy) is set.
    Conclusion so far: no missing account holding money has been found; the gap looks like zero-balance registrations.
    The Ethereum check is still pending.
25. **Ethereum token discovery:** still a fixed list of known token contracts (enumerating AssetWhitelisted events needs
    archive logs). TODO when the Alchemy key arrives.
26. **Storage:** Postgres when `DATABASE_URL` is set, otherwise `data/*.jsonl` (gitignored). `scripts/reserves-worker.ts`
    runs every 60 s and never overlaps runs.
27. **Flow-match findings (open).** (a) Ethereum is close (99.3% out) but has partial-day coverage until an archive-capable
    `ETH_RPC_URL` is set. (b) Cardano reported deposits far exceed priced on-chain inflows. Likely causes: unpriced sUSDr/LP
    moves, and ADA valued at the current price instead of the historic one. Not yet explained. (c) Solana 20 Oct: Strike reports
    $499.56 in, but no token movement was seen on the locker's USDC account (it may be a SOL deposit to another account).
    No tolerance was widened to make these pass.
28. **Ethereum `Deposit.userID`** = the depositor's Strike account UUID in the first 16 bytes (e.g.
    `0x01a09b405e83700080d6b03bcb794010…` → `01a09b40-5e83-7000-80d6-b03bcb794010`). This allows an exact on-chain ↔ account
    coverage check once full log history is available.
29. **Builder Connect:** Strike's API sends `Access-Control-Allow-Origin: *` with the X-API-Wallet-* headers allowed, so
    the browser talks to Strike directly. The API-wallet Ed25519 private key is generated and kept only in the user's browser
    tab; the ZeroGap server never sees it. Withdrawals can only go to the wallet the user connected with (Strike enforces
    this server-side), and each one needs the user's own wallet signature.
30. **No simulation mode** (owner's decision, 22 Oct): alerts fire only on real events. The PRD's `[SIMULATION]` demo
    path is removed. Tests still use recorded real API responses so CI never depends on the network.

## 2026-10-22 (founder update, 13:12–14:30)

31. **Official prices for sUSDrf, LP and aUSDC:** `GET /v2/credit/collateral-assets` (Strike Credit, docs `/api/credit`) gives
    price, `price_available` and `price_fresh` per collateral asset. The custody mapping comes from `/v2/credit/settings`.
    Implemented as `strikeCreditAdapter` (one adapter, as planned). The on-chain `sUSDr` token is Strike's `sUSDrf`.
    Only iUSD is still unpriced (it is not a Credit collateral asset).
32. **LP decimals:** the SundaeSwap LP token has empty CIP-68 metadata, so Koios reports 0 decimals. Strike's custody
    mapping says `raw_amount_scale` 6. Strike's 36,624.5 LP × $1.0164 = $37,227, matching our earlier pool look-through
    of $37.2k.
33. **New reserve found: aEthUSDC.** The Ethereum locker holds 1,857.09 aEthUSDC (Aave V3, whitelisted in the vault).
    It is reported in scaled units and priced with Strike's `SCALED_AAVE_V3_ETH_aUSDC` price.
34. **Rewards discounted** (founder: "only tradeable and not withdrawable"). Liabilities = Σ margin_balance − Σ
    lockedRewards. Staking rewards and referral rewards are shown but not counted. This replaces DECISIONS #20.
35. **Solana:** the corrected IDL (`strike_vault`, same program) is installed. The founder confirmed `BT85fgyh…` holds the USDC.
    VaultState PDA `6zPB32Hh…` is decoded (paused, pending_withdrawal_count, recovered, global usage windows). Cross-check:
    its 24h usage of 3,979 equals the Solana outflow the flow match decoded for 21 Oct (3,978.90 USDC).
36. **Vault exclusion vs data (live, 12:28 UTC, after #31–#34):** priced reserves $1,869,545; withdrawable liabilities $744,060.
    With vaults excluded: **251.26%**. With vaults included ($1,086,607): **102.12%**. The founder said the gap should
    be a few thousand dollars, with an Ethereum LP withdrawal and funds in the IOG bridge in flight. Only the vaults-included
    figure is close to that. Still asking the founder; the published ratio follows his rule until then.

## 2026-10-22 (founder update: full spec, applied 18:20 IST)

37. **Which address holds what (live 12:51 UTC):**
    - Ethereum `0xbF4c…cffa` (vault): 139,519.19 USDC + 1,559.78 scaled aEthUSDC; 0 ETH.
    - Solana `BT85fgyh…CAA6` (USDC token account, owner `Dj9NkHy…Prrt`): 3,209.30 USDC.
    - Solana `Dj9NkHy…Prrt` (Vault account): 0.0836 SOL (its own rent; counted, about $8.7).
    - Solana `H4nZyX…ic5H` (treasury PDA): 0.00095 SOL.
    - Cardano `addr1w9yg…kls3` (deposit script): 316,251 ADA, 478,570 USDCx, 770,081 USDM, 269,232 sUSDrf,
      36,624.5 LP_SUNDAE_USDCx_USDM, 5,725 iUSD (unpriced).
    - Cardano `addr1w9m5…7jf2` (protocol script): 2 ADA, 140 USDM.

    SPL token accounts are read from both owners (the vault account and the treasury PDA) plus the named account `BT85…`
    directly. They are de-duplicated by token-account address, so `BT85…` is counted once. Lamports held inside a token
    account are its rent and are not counted as reserves.
38. **Rewards inside margin_balance, from live `/v2/balances`:**
    - `lockedRewards` **is inside** walletBalance/margin_balance. Account `019d5401…`: wallet 19.24, locked 4.83, max
      withdrawable 14.41 (= 19.24 − 4.83). Account `019d58b0…`: wallet 10, locked 10, max withdrawable 0. Across a full
      scan, 595 of 606 accounts with locked rewards satisfy walletBalance − maxWithdrawAmount ≥ lockedRewards; the other 11
      are accounts where other holds (margin) dominate. So locked rewards are **subtracted** ($3,449 total).
    - `stakingRewardBalance` is **separate**. Account `019d0c57…`: margin 0.0048, staking 6.20. It is **not added** ($32,045
      total). The staking and referral reward liability lines are removed from code and UI.
    - My earlier test (DECISIONS #21) compared maxWithdrawAmount with maxWithdrawAfterRewards; both already exclude locked
      rewards, which is why it found "not inside". Corrected.
39. **Strike custody mappings drive unit conversion.** `/v2/credit/settings` `custody_asset_mappings` re-derives each
    mapped asset's amount from its raw integer (`raw_amount_scale`) and checks that the price id we use equals Strike's
    `custody_asset`; a mismatch fails loudly. Credit prices are current only if available, fresh and before
    `price_expires_at`; otherwise the last good price is used and flagged `stale`.
40. **One price snapshot per scan.** Reserves are read right after the liability scan and valued with a single frozen
    snapshot of the Strike feed and Credit prices. `priceSnapshotAt` is stored next to the scan window.
41. **Known in-transit gap.** |reserves − liabilities| ≤ `IN_TRANSIT_TOLERANCE_USD` (default $10,000, from the founder's
    "a few $K") is shown as **In transit** with a note: not Drift, not an alert, and the missing amount is never added.
    The gap is always shown in USD and % ("Gap −$12 · −0.0004%").
42. **Solana M3:** full VaultState decode (adds asset_usage[20], admin_withdrawal_count, last_admin_withdrawal),
    PendingWithdrawal and PendingAction decoders (found via getProgramAccounts with a discriminator filter; 0 open now),
    and an instruction watcher that names program instructions by IDL discriminator (recent mainnet activity: deposit,
    bulk_withdraw). Pause/recovery and queued/timelocked items feed the same alert rules as Ethereum. Admin, config,
    pause and governance instructions alert; deposits and payouts are feed-only.
43. **docs/PRD.md has no Sections 8 or 9** (the repo copy ends at Section 7). Applied the founder update as written.
