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
