# Gap investigation (23 Oct 2026, ~10:00 UTC)

The founder said the −$63K gap looks way off. Full live pull: 3,479 accounts (3,001 masters + 478 sub-accounts),
`/v2/balances` for each, and all 6 vaults with every depositor. Reserves at the time: $1,783,392.09.
No formula change was made; the published formula is still the founder-confirmed one (DECISIONS #50).

| Total | USD |
| --- | --- |
| Σ wallet_balance | 695,122.73 |
| Σ unrealized_pnl | **+33,740.14** (positive 69,376.25 · negative −35,636.11) |
| Σ equity (wallet + upnl) | 728,862.87 |
| Σ margin_balance | 652,447.40 (equity − margin = 76,415.47, all in 46 isolated-margin accounts) |
| Σ depositor vault shares | 1,086,255.62 |
| Σ stakingRewardBalance | 31,952.85 |

## The six checks

1. **Isolated margin added on top of wallet_balance? No.** The code counts only `wallet_balance + unrealized_pnl`;
   the isolated-margin line is shown as "included" and never added. margin_balance equals available_balance and
   leaves out both the isolated margin and its unrealized PnL (e.g. 019d0c8c…: wallet 12,331, upnl −4,635,
   margin_balance 0.00).
2. **Master wallet includes sub-accounts? No.** `/v2/account` returns each account's own balance. Evidence: master
   019e52bb… own equity 683.68 + its sub 8,080.87 = 8,763.30, exactly the leaderboard equity, which therefore
   aggregates subs; sub-accounts are not separate leaderboard rows. Σ our 3,479 accounts = 728,863 vs Σ leaderboard
   equity 729,108 (0.03% apart, timing). No double count.
3. **Staking inside wallet_balance? No.** 502 of 762 accounts with staking > $1 have wallet_balance smaller than
   their staking balance (e.g. wallet 5.12, staking 1,165.80), so it cannot be inside.
4. **Vault shares inside depositors' wallets? No.** Largest depositors have wallet 0.00 and shares of $143,867,
   $113,909, $65,899 … The vault money lives in the vault accounts (Σ vault equity 1,086,259 ≈ Σ shares 1,086,256).
5. **Unrealized PnL. This is the main finding.** Traders' net unrealized PnL is **+$33,740**. On a perps exchange
   every long has a short, so net PnL across everyone should be about zero. The losing side of this +$33.7K is
   not in the scanned set (vault accounts hold only +$1,003 upnl), so it most likely sits with Strike's market
   maker / liquidity provider / house accounts, which are not on the public leaderboard. One account alone,
   019d728d…, has +$32,030 unrealized on an isolated position (wallet 7,426, margin_balance −3,386).
   Under the old margin_balance formula this isolated profit was invisible, which is why the gap moved by ~$71K.
6. **Top 5 by (equity − margin_balance) vs leaderboard equity (what the Strike app shows):**

   | Account | Equity (ours) | margin_balance | Leaderboard equity |
   | --- | --- | --- | --- |
   | 019d728d… | 39,455.87 | −3,386.39 | 39,847.37 (incl. 358 in subs) |
   | 019d0c8c… | 7,695.97 | 0.00 | 7,720.38 |
   | 019f9e67… (sub) | 7,110.33 | 0.01 | in its master's row |
   | 01a07991… (sub) | 6,176.34 | 511.46 | in its master's row (019f20bc…: 8,728.97 = 2,562 + 6,176) |
   | 019f1044… | 1,825.89 | 319.00 | 1,829.83 |

   Our equity matches what Strike itself shows for every one of them.

## What the gap is made of

| Liabilities counted | Ratio | Gap |
| --- | --- | --- |
| A. Current formula (equity + vault shares + staking) | 96.55% | −$63,679 |
| B. A minus traders' net unrealized PnL (+$33,740) | 98.35% | −$29,939 |
| C. B minus staking rewards ($31,953) | **100.11%** | **+$2,014** |

So the −$63K is almost exactly **net unrealized trader profit ($33.7K) + staking rewards ($32.0K)**. Neither looks
like a counting bug: both are real amounts owed to users. The open questions for Strike:

- **Where is the counterparty of the +$33.7K net unrealized PnL?** (market maker / LP / house accounts not on the
  leaderboard, or unpaid by losers). If those accounts are included, their negative PnL offsets it.
- **Where are staking rewards backed?** If they are funded from the STRIKE staking/DAO treasury rather than the perps
  lockers, that wallet belongs in reserves.

The dashboard stays on "Under review with Strike".
