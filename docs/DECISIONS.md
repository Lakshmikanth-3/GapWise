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
