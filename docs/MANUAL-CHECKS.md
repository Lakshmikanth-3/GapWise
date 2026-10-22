# Manual checks (T1.6, T2.9)

Fill in the "Explorer / App shows" column, then commit. Values are ZeroGap's snapshot of **2026-10-22 14:42 UTC**.
Balances move all the time, so compare within a few minutes of a fresh scan (the dashboard's "Last scan" time).

## T1.6: reserves match the explorers

| Chain | Address (open from the dashboard links) | Asset | ZeroGap | Explorer shows | Match? |
| --- | --- | --- | --- | --- | --- |
| Ethereum | `0xbF4cFccd11257e568A936a7867D138f54A43cffa` (etherscan.io → Token Holdings) | USDC | 139,536.069212 | | |
| Ethereum | same | aEthUSDC | 1,857.09 (= 1,559.777085 scaled × Aave index) | | |
| Solana | `BT85fgyhyZhCtaNdciKEGoj7mU8E3EeFijPy6XCmCAA6` (solscan.io) | USDC | 3,125.833564 | | |
| Solana | `Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt` | SOL | 0.08360477 | | |
| Solana | `H4nZyX3qGQwGH6wQn8G53uZ6LX8TqPZDakCN2M54icSH` | SOL | 0.00094656 | | |
| Cardano | `addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3` (cardanoscan.io) | ADA | 316,260.195516 | | |
| Cardano | same | USDM | 772,264.471891 | | |
| Cardano | same | USDCx | 475,551.204705 | | |
| Cardano | same | sUSDrf (on-chain name sUSDr) | 269,232.20978 | | |
| Cardano | same | LP (SundaeSwap USDCx/USDM) | 36,624.526431 (explorer may show 36,624,526,431 raw) | | |
| Cardano | same | iUSD | 5,725.378737 | | |
| Cardano | `addr1w9m5m4v8vfpq74n6cd0z33r3jlatfkfsykpcjaxze8af33qxh7jf2` | ADA / USDM | 2 / 140 | | |

## T2.9: account values match the Strike app

Search each address on app.strikefinance.org (Leaderboard → search), or use your own Portfolio for the last row.

| Account | Wallet | ZeroGap account value (`/v2/account` margin_balance) | Strike app shows | Match? |
| --- | --- | --- | --- | --- |
| — | `addr1q945ppz2…z9rsh2` | $262.53 | | |
| andrewadaberg | `addr1qxyu2smu…q6r47pw` | $144.33 | | |
| — | `addr1qygw5tvm…q289x82` | $319.00 | | |
| theprospector | `addr1q84l5rht…qy9xp5j` | $356.72 | | |
| you (kanth, mainnet) | `0x43DDBD19381C8Ea8C1e4670d18DdB97c43fbEFDC` | $0.00 | | |

Full addresses: run `npm run first-ratio` or see the table in the chat log of 22 Oct.
