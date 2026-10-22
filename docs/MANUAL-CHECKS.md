# Manual checks (T1.6, T2.9)

**T1.6 PASSED** (every explorer value matches). **T2.9 found an issue:** `margin_balance` leaves out isolated-margin
positions. Across all 3,472 accounts, Σ(wallet_balance + unrealized_pnl) = $717,690.02 vs Σ margin_balance = $644,140.48,
a difference of **$73,549.54 in 47 accounts, every one with an isolated-margin setting**. Raised with Strike; see DECISIONS #50.

Fill in the "Explorer shows" column, then commit. Values are ZeroGap's snapshot of **2026-10-22 22:14 UTC**
(`npm run first-ratio`: reserves $1,780,544.74 · liabilities $1,771,933.27 · ratio 100.4860% In transit).
Balances move all the time, so compare within a few minutes of a fresh scan.

## T1.6: reserves match the explorers

| Chain | Address (open from the dashboard links) | Asset | ZeroGap | Explorer shows | Match? |
| --- | --- | --- | --- | --- | --- |
| Ethereum | `0xbF4cFccd11257e568A936a7867D138f54A43cffa` (etherscan.io → Token Holdings) | USDC | 161,304.560153 | token total $163,079.61 (7 tokens, incl. airdropped spam) vs ZeroGap $163,161.71 | ✅ within 0.05% (price differences) |
| Ethereum | same | aEthUSDC | 1,857.15 (= 1,559.777085 scaled × Aave index) | inside Etherscan token total $163,079.61 | ✅ (total within 0.05%) |
| Ethereum | same | ETH | 0 | 0 ETH | ✅ exact |
| Solana | `BT85fgyhyZhCtaNdciKEGoj7mU8E3EeFijPy6XCmCAA6` (solscan.io) | USDC | 3,111.880769 | 3,111.880769 USDC | ✅ exact |
| Solana | `Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt` | SOL | 0.08360477 | 0.08360477 SOL | ✅ exact |
| Solana | `H4nZyX3qGQwGH6wQn8G53uZ6LX8TqPZDakCN2M54icSH` | SOL | 0.00094656 | 0.00094656 SOL | ✅ exact |
| Cardano | `addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3` (cardanoscan.io) | ADA | 328,270.954874 | 328,270.954874 ADA | ✅ exact |
| Cardano | same | USDM | 767,828.562555 | 767,828.562555 | ✅ exact |
| Cardano | same | USDCx | 462,794.53183 | 462,794.531830 | ✅ exact |
| Cardano | same | sUSDrf (on-chain name sUSDr) | 269,439.734558 | 269,439.734558 (SUSDRF) | ✅ exact |
| Cardano | same | LP (SundaeSwap USDCx/USDM) | 36,624.526431 (explorer may show 36,624,526,431 raw) | 36,624,526,431 raw | ✅ exact |
| Cardano | same | iUSD | 5,725.378737 | 5,725.378737 | ✅ exact |
| Cardano | `addr1w9m5m4v8vfpq74n6cd0z33r3jlatfkfsykpcjaxze8af33qxh7jf2` | ADA / USDM | 2 / 140 | 2 ADA, 1 token | ✅ exact (ADA) |

## T2.9: account values match the Strike app

Search each address on app.strikefinance.org (Leaderboard → search), or use your own Portfolio for the last row.

| Account | Wallet | ZeroGap account value (`/v2/account` margin_balance, 22 Oct — re-read before comparing) | Strike app shows | Match? |
| --- | --- | --- | --- | --- |
| — | `addr1q945ppz2…z9rsh2` | $262.53 (live 22:3x UTC: $262.53) | Leaderboard equity $262.53 | ✅ exact |
| andrewadaberg | `addr1qxyu2smu…q6r47pw` | $144.33 (live 22 Oct 22:22 UTC: $142.17) | Leaderboard equity $142.40 | ✅ within 0.2% |
| — | `addr1qygw5tvm…q289x82` | margin_balance $319.00 | Leaderboard equity ≈ $1,759 (wallet 2,228.97 + uPnL) | ❌ **finding**: account has an ISOLATED ADA-USD position; margin_balance covers cross margin only |
| theprospector | `addr1q84l5rht…qy9xp5j` | live 22 Oct 22:29 UTC: $287.56 = wallet_balance 506.08 + unrealized −218.52 | Leaderboard equity $699.29 = wallet_balance 506.08 + unrealized +193.21 (hourly snapshot) | ✅ wallet_balance identical; difference is only the stale unrealized PnL on the hourly leaderboard |
| you (kanth, mainnet) | `0x43DDBD19381C8Ea8C1e4670d18DdB97c43fbEFDC` | $0.00 | Portfolio account value $0.00 | ✅ exact |

Full addresses: run `npm run first-ratio` or see the table in the chat log of 22 Oct.
