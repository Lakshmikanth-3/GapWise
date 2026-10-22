# Strike Watchtower — PRD & Build Plan

Oct 22, 2026 · @Lakshmikanth

## 1. Overview

Strike Watchtower is an independent, live proof-of-solvency and safety monitor for Strike Finance, submitted to the Strike Hackathon by Friday 23 October 2026, 10:00 AM EST (7:30 PM IST).

### Problem

Strike V2 runs matching, positions, liquidations and funding off-chain on the Strike Node, while custody sits in on-chain locker contracts. Users must trust the operator's balances. The docs say reserves are "verifiable by anyone", but no public tool does the check, and independent replay is still a roadmap item.

### Solution

A public dashboard plus alert bot that:

- Reads the three locker contracts (Cardano, Ethereum, Solana) on-chain and prices every asset in USD.
- Sums every account's value from Strike's public API to get exact liabilities.
- Publishes a live reserve ratio, a flow-match check, and alerts on safety-control events.
- Lets any trader connect a wallet and see their own balance verified against the lockers.

### Goals

1. Exact reserve ratio from public data only, refreshed at least every 5 minutes.
2. Flow match between Strike-reported and on-chain deposits/withdrawals per chain, per day.
3. Real-time alerts for queued large withdrawals, pauses, timelocked changes and abnormal outflows.
4. A personal "My Safety" view via Strike Builder Connect.
5. A 2-minute demo that runs on live mainnet data, with a labelled simulation mode for the alarm.

### Non-goals

- Moving or custodying any user funds (Watchtower is read-only; withdrawals are signed by the user).
- Full Strike Node replay (needs the open-source node; listed as roadmap).
- Trading features (Strike already ships copy trading, TWAP, grid and trailing stops).

### Success metrics

| Metric | Target |
| --- | --- |
| Reserve ratio refresh | ≤ 5 min |
| Account coverage (accounts summed / accounts listed) | 100% |
| Flow-match tolerance per chain per day | within 1% |
| Alert latency after on-chain event | ≤ 60 s |
| Dashboard load time | ≤ 2 s |
| Unit + integration tests passing in CI | 100% |

### Judging criteria mapping

| Criterion | How Watchtower answers it |
| --- | --- |
| Innovation | First independent solvency monitor for Strike; matches its own decentralization roadmap |
| Integration with Strike | Locker contracts on 3 chains, account API, leaderboard, stats API, price feed, Builder Connect |
| Utility and impact | Trust for large depositors (RealFi vault, "we want billions"); personal safety view for traders |
| Technical execution | Exact math, multi-chain readers, tested pipeline, live demo |
| Future potential | Official transparency page; first step to an independent validator |

## 2. Confirmed facts and data sources

Every input Watchtower needs is public and was confirmed by Shan (Strike founder) on Discord, 21 October 2026.

### Locker contracts (reserves)

| Chain | Address | Explorer |
| --- | --- | --- |
| Solana | `Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt` | Solscan |
| Ethereum | `0xbF4cFccd11257e568A936a7867D138f54A43cffa` | Etherscan (not verified yet; ABI coming from Shan) |
| Cardano | `addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3` | Cardanoscan (script address) |

Lockers hold stablecoins and also ADA, ETH and SOL. All user funds are in these three lockers. There is no insurance fund anymore.

### Strike API endpoints (all public, no API key)

| Purpose | Endpoint | Field used |
| --- | --- | --- |
| Account list | `GET https://api.strikefinance.org/stat/v1/stats/leaderboard` (no params = full list) | `account_id`, `vault_id` |
| Account value (liabilities) | `GET https://api.strikefinance.org/v2/account?account_id=<uuid>` | `margin_balance` (wallet + unrealized PnL), `sub_accounts` |
| Platform flows | `GET /stat/v1/dashboard/transfers` and `/summary` | daily deposits/withdrawals per chain |
| Prices | `https://api.strikefinance.org/price` and `wss://api.strikefinance.org/ws/price` | mark/index prices |
| Builder Connect | `POST /auth/builder/request-signature`, `/verify-signature` | API wallet for My Safety |
| Testnet | `https://api-v2-testnet.strikefinance.org` | same paths |

### Rules from Shan

- Rate limit: stay under 50 requests/second (we use 40).
- Leaderboard balances lag behind; use it only for the list of accounts, then read each account live.
- SLP and Borrow and Earn deposits are already inside each person's account value.

### Open items

- [ ] Ethereum locker ABI received from Shan (00:02 IST, 22 Oct); save as packages/collectors/abi/ethereum-vault.json
- [ ] Solana IDL: first file was an example ("strike\_example", program 7XASQ24f…); Shan is sending the corrected mainnet IDL. Confirm which account holds funds (treasury PDA vs Dj9NkHy…)
- [ ] Confirm whether sub-accounts appear in the leaderboard list on their own

Sources: [Strike docs](https://docs.strikefinance.org/), [Account API](https://docs.strikefinance.org/api/user/rest-api/account.md), [Leaderboard API](https://docs.strikefinance.org/api/platform-stats/leaderboard.md), [Platform dashboard API](https://docs.strikefinance.org/api/platform-stats/platform-dashboard.md), [Builder Codes](https://docs.strikefinance.org/api/builder-codes.md), [Withdrawal security](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals/withdrawal-security-and-controls.md).

## 3. Features and requirements

Four modules, built in priority order: M1 and M2 are the core and must ship; M3 and M4 lift the score from good to strong.

### M1. Live Reserves (P0)

Reads each locker's balances on-chain and converts them to USD.

- FR-1.1 Read native and token balances for all three lockers every 60 s.
- FR-1.2 Price each asset with Strike's price feed; fall back to the last good price if the feed fails, and flag it.
- FR-1.3 Show totals by chain and asset, each linked to its explorer.
- **Acceptance:** dashboard totals match the explorers' balances to the cent for stablecoins and within price rounding for ADA/ETH/SOL.

### M2. Reserve Ratio and Flow Match (P0)

- FR-2.1 Fetch the full account list from the leaderboard; add sub-accounts from each `/v2/account` response.
- FR-2.2 Call `/v2/account` for every account at ≤ 40 req/s with retry and backoff; sum `margin_balance`.
- FR-2.3 Reserve ratio = reserves ÷ liabilities, stored with timestamp, account count and failures.
- FR-2.4 Flow match: compare Strike's daily deposits/withdrawals per chain with on-chain transfers into and out of each locker.
- FR-2.5 Show the confidence label: Exact (100% accounts read), Partial (some failed, with count), Stale (older than 10 min).
- **Acceptance:** a full scan finishes, coverage reaches 100%, and the ratio is shown with its formula and timestamp.

### M3. Safety-Control Monitor (P1)

- FR-3.1 Decode locker events with the ABI/IDL: large withdrawal queued/executed/cancelled, pause/unpause, timelock proposed/finalized.
- FR-3.2 Track 1-hour and 24-hour outflow against recent history; alert on unusual spikes.
- FR-3.3 Alert rules: ratio below 100%, flow mismatch above 1%, any pause, any queued large withdrawal, any timelocked change.
- FR-3.4 Deliver alerts to a Telegram channel within 60 s, with explorer links; de-duplicate repeats.
- **Acceptance:** every rule fires once in simulation mode and never on a clean live run.

### M4. My Safety (P1)

- FR-4.1 Connect Phantom, Rabby/MetaMask or a CIP-30 Cardano wallet through Strike Builder Connect.
- FR-4.2 Show the user's account value, maximum withdrawable now, and the platform reserve ratio behind it.
- FR-4.3 One-tap withdrawal shortcut: request a quote, the user signs in their own wallet. Watchtower never holds keys that can move funds.
- **Acceptance:** a testnet wallet connects, shows correct balances, and completes one signed testnet withdrawal.

### Non-functional requirements

| Area | Requirement |
| --- | --- |
| Honesty | Every number shows its source, timestamp and confidence; simulation data is always labelled |
| Rate limits | ≤ 40 req/s to Strike; respect explorer/RPC free-tier limits |
| Security | Read-only by default; no private keys stored server-side except per-user API wallet keys, encrypted |
| Reliability | One failed source never blanks the dashboard; it shows the last good value plus a warning |
| Open source | MIT licence, public GitHub repo, README with setup in under 5 commands |

## 4. Architecture and tech stack

Watchtower is one TypeScript monorepo: background workers collect public data, one engine computes, and three outputs read the stored snapshots.

&#91;embedded content: Watchtower architecture · 5 collectors, 1 engine, 3 outputs\]

Collectors write raw snapshots; the engine reads them, computes ratios and alerts, and the outputs only read results, so a slow chain never blocks the dashboard.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (Node 20) | One language for workers, API and UI; Strike skills ship TypeScript examples |
| Frontend | Next.js 14 + Tailwind + Recharts | Fast to build, deploys free on Vercel |
| Workers | Node + `node-cron` (or GitHub Actions cron as fallback) | Simple scheduled jobs |
| Database | Postgres on Supabase (free tier) | Stores snapshots and alert history |
| Cardano | Blockfrost API (free key) or Koios | Address balances, UTxOs, transactions |
| Ethereum | `viem` + public RPC (Alchemy/Infura free) | Balances, ERC-20 reads, event logs with ABI |
| Solana | `@solana/web3.js` + Helius/public RPC | SOL and SPL token balances, program logs with IDL |
| Strike | REST + WebSocket, `tweetnacl` for Ed25519 signing | Public endpoints + Builder Connect |
| Wallets | Phantom/Solana adapter, `wagmi`, CIP-30 via Mesh | Builder Connect sign-in |
| Alerts | Telegram Bot API | Free, instant, easy to demo |
| Testing | Vitest, `msw` (HTTP mocks), Playwright | Unit, integration, end-to-end |
| CI | GitHub Actions | Runs all tests on every push |

### Must-use (judges look for these)

- The three locker addresses read on-chain, never copied from Strike's own numbers.
- Strike public API: leaderboard, `/v2/account`, transfers, price feed.
- Strike Builder Connect with your registered builder code (My Safety).
- Strike testnet for every write action before mainnet.
- `npx strike-finance-skills install` so your AI coding assistant knows Strike's API.

### Repository structure

```
strike-watchtower/
  apps/web/            Next.js dashboard + My Safety
  packages/core/       engine: ratio, flow match, alert rules (pure functions)
  packages/collectors/ cardano.ts, ethereum.ts, solana.ts, accounts.ts, stats.ts, prices.ts
  packages/alerts/     telegram.ts, dedupe.ts
  packages/db/         schema.sql, queries.ts
  tests/               unit/, integration/, e2e/, fixtures/
  .github/workflows/   ci.yml, scan.yml
```

### Data model

| Table | Key columns |
| --- | --- |
| `reserve_snapshots` | ts, chain, asset, amount, usd\_price, usd\_value |
| `liability_snapshots` | ts, accounts\_listed, accounts\_read, failures, total\_usd |
| `ratio_snapshots` | ts, reserves\_usd, liabilities\_usd, ratio, confidence |
| `flow_checks` | day, chain, reported\_in, onchain\_in, reported\_out, onchain\_out, match\_pct |
| `safety_events` | ts, chain, type, amount, tx\_hash, status |
| `alerts` | ts, rule, severity, message, sent, simulated |

## 5. Phased build plan

Seven phases from Thursday 00:00 IST to submission by Friday 18:30 IST, one hour before the 19:30 IST deadline. Each phase ends with a test gate: do not start the next phase until its tests pass.

| Phase | Window (IST) | Output |
| --- | --- | --- |
| P0 Setup | Thu 00:00–02:00 | Repo, CI, keys, first manual ratio |
| P1 Reserves | Thu 08:00–12:00 | Three chain collectors + prices |
| P2 Liabilities and ratio | Thu 12:00–18:00 | Account scanner, ratio, flow match |
| P3 Dashboard | Thu 18:00–23:30 | Public site live on Vercel |
| P4 Safety monitor and alerts | Fri 07:00–11:00 | Event decoding, rules, Telegram |
| P5 My Safety | Fri 11:00–14:30 | Builder Connect, personal view |
| P6 Harden, demo, submit | Fri 14:30–18:30 | Video, README, submission |

Sleep Thursday 02:00–08:00 and 23:30–07:00. If a phase overruns, cut M4 (My Safety) to a read-only balance lookup by wallet address before cutting tests.

### P0. Setup (Thu 00:00–02:00)

**Tasks**

1. Create the GitHub repo with the structure in section 4; add MIT licence and CI running `vitest`.
2. Get free keys: Blockfrost, Alchemy (Ethereum), Helius (Solana), Supabase, Telegram bot token.
3. Register at the Strike Builder Dashboard and save your builder code.
4. Run `npx strike-finance-skills install`.
5. Write `scripts/first-ratio.ts`: read the three lockers once, scan all accounts, print the ratio.

**Test suite P0**

| ID | Test | Pass when |
| --- | --- | --- |
| T0.1 | CI runs on push | GitHub Actions green on an empty test |
| T0.2 | Env check | Script exits with a clear error if any key is missing |
| T0.3 | Strike reachability | `GET /v2/account` with a known account id returns 200 without auth |
| T0.4 | First ratio sanity | Ratio prints and is between 0.5 and 2.0; record it in the README |

**Exit gate:** first real reserve ratio printed. If far from 1.0, investigate before building more.

### P1. Reserves collectors (Thu 08:00–12:00)

**Tasks**

1. `cardano.ts`: ADA and native-token balances of the locker script address.
2. `ethereum.ts`: ETH balance plus ERC-20 balances (USDC and any others found on Etherscan).
3. `solana.ts`: SOL plus SPL token accounts owned by the locker.
4. `prices.ts`: Strike price feed to USD, with last-good fallback.
5. Save each run to `reserve_snapshots`.

**Test suite P1**

| ID | Type | Test | Pass when |
| --- | --- | --- | --- |
| T1.1 | Unit | Lovelace, wei and lamport conversion | 1 ADA = 10^6, 1 ETH = 10^18, 1 SOL = 10^9 units, exact with BigInt |
| T1.2 | Unit | USD valuation | amount × price correct to 2 decimals; stablecoin = 1.00 |
| T1.3 | Unit | Price fallback | feed error returns last good price with `stale: true` |
| T1.4 | Integration (mocked) | Each collector parses a recorded API fixture | output matches expected JSON |
| T1.5 | Live smoke | Each collector against mainnet | returns non-zero balances within 10 s |
| T1.6 | Manual check | Compare with Etherscan, Solscan, Cardanoscan | totals match the explorers |

**Exit gate:** T1.1–T1.6 pass; reserves stored every 60 s.

### P2. Liabilities, ratio and flow match (Thu 12:00–18:00)

**Tasks**

1. `accounts.ts`: fetch the leaderboard full list; queue every `account_id` and vault.
2. Token-bucket rate limiter at 40 req/s; retry 3 times with backoff on 429/5xx.
3. Add sub-accounts found in each `/v2/account` response; de-duplicate by `account_id`.
4. Sum `margin_balance`; record listed, read and failed counts.
5. `core/ratio.ts` and `core/flowMatch.ts` as pure functions.
6. Flow match: Strike `/dashboard/transfers` per chain per day vs on-chain locker transfers.

**Test suite P2**

| ID | Type | Test | Pass when |
| --- | --- | --- | --- |
| T2.1 | Unit | Ratio formula | 1,010 / 1,000 = 1.01; liabilities 0 returns `undefined`, not Infinity |
| T2.2 | Unit | Confidence label | 100% read = Exact; any failure = Partial with count; > 10 min = Stale |
| T2.3 | Unit | De-duplication | an account listed twice and as a sub-account is counted once |
| T2.4 | Unit | Negative equity | negative `margin_balance` is included as-is and flagged |
| T2.5 | Unit | Rate limiter | 1,000 calls take ≥ 25 s; never more than 40 in any second |
| T2.6 | Integration (mocked) | 429 then 200 | retried and succeeds; 3 failures recorded as failed |
| T2.7 | Unit | Flow match | equal flows = 100%; 2% gap triggers mismatch |
| T2.8 | Live | Full scan | coverage 100%, completes in under 5 min |
| T2.9 | Live | Spot check | 5 random accounts match the Strike app's displayed value |

**Exit gate:** a full live scan gives an Exact ratio; flow match computed for the last 7 days.

### P3. Dashboard (Thu 18:00–23:30)

**Tasks**

1. Home: big ratio with confidence label, reserves vs liabilities, last-updated time.
2. Breakdown: by chain and asset, explorer links.
3. History chart of the ratio; flow-match table per chain per day.
4. "How we compute" page showing formulas and endpoints.
5. Deploy to Vercel; workers on a small server or GitHub Actions cron.

**Test suite P3**

| ID | Type | Test | Pass when |
| --- | --- | --- | --- |
| T3.1 | Component | Ratio card | renders value, label and timestamp from a fixture |
| T3.2 | Component | Stale state | snapshot older than 10 min shows a warning banner |
| T3.3 | Component | Source failure | one chain missing shows last good value + warning, page still loads |
| T3.4 | E2E (Playwright) | Home loads | under 2 s, all three chains shown, links open the right explorer |
| T3.5 | E2E | Mobile width 375 px | no horizontal scroll |

**Exit gate:** public URL live with real data.

### P4. Safety monitor and alerts (Fri 07:00–11:00)

**Tasks**

1. Decode Ethereum events with Shan's ABI and Solana logs with the IDL; poll Cardano transactions on the script address.
2. Store queued withdrawals, pauses and timelock actions in `safety_events`.
3. Alert rules from FR-3.3; outflow spike = 1-hour outflow above 3× the 7-day hourly average.
4. Telegram sender with de-duplication (same rule + same tx = one alert).
5. Simulation mode: inject fixture events, every alert tagged `[SIMULATION]`.

**Test suite P4**

| ID | Type | Test | Pass when |
| --- | --- | --- | --- |
| T4.1 | Unit | Event decoder | each ABI/IDL fixture decodes to the right type and amount |
| T4.2 | Unit | Each alert rule | fires on its trigger fixture, silent on a clean fixture |
| T4.3 | Unit | De-duplication | the same event twice sends one alert |
| T4.4 | Unit | Simulation tag | simulated alerts always carry `[SIMULATION]` and `simulated = true` |
| T4.5 | Integration | Telegram | message arrives in a test channel within 60 s |
| T4.6 | Live | Clean run | 1 hour on mainnet with zero false alerts |

**Exit gate:** every rule fires once in simulation; no false alerts live.

**Fallback:** if the ABI/IDL has not arrived by Friday 09:00, monitor balance outflows only and list event decoding as roadmap.

### P5. My Safety (Fri 11:00–14:30)

**Tasks**

1. Builder Connect flow: generate an Ed25519 key pair, request signature, user signs, verify.
2. Show the user's `margin_balance`, `maxWithdrawAmount` (from `/v2/balances`) and the platform ratio.
3. Withdrawal shortcut: quote, then user signs the message in their wallet.
4. Test everything on testnet first.

**Test suite P5**

| ID | Type | Test | Pass when |
| --- | --- | --- | --- |
| T5.1 | Unit | Request signing | message = `METHOD:PATH:TIMESTAMP:NONCE:SHA256(body)`, signature verifies with tweetnacl |
| T5.2 | Unit | Nonce | every request uses a new UUID |
| T5.3 | Integration (testnet) | Connect Phantom | API wallet created, account id returned |
| T5.4 | Integration (testnet) | Balance view | matches the Strike testnet app |
| T5.5 | Integration (testnet) | Withdrawal | quote, user signature, status pending |
| T5.6 | Security | Key storage | no private key in logs, repo or browser storage unencrypted |

**Exit gate:** one full testnet connect and withdrawal recorded on video.

**Fallback:** if Builder Connect blocks you, ship "check by wallet address" using the public `/v2/account?blockchain_address=` lookup.

### P6. Harden, demo, submit (Fri 14:30–18:30)

**Tasks**

1. Run the full test suite; fix failures; tag release `v1.0`.
2. README: problem, how it works, formulas, endpoints, setup, tests, roadmap, honest limits.
3. Record the 2-minute demo (script in section 6).
4. Submit through the official form; post the link in Strike's Discord and share with Shan.

**Test suite P6 (release checklist)**

| ID | Test | Pass when |
| --- | --- | --- |
| T6.1 | `npm test` from a fresh clone | all unit and integration tests pass |
| T6.2 | README setup | a fresh machine runs it in under 5 commands |
| T6.3 | Live site | ratio updated within the last 5 min |
| T6.4 | Demo video | under 3 min, shows live data and the labelled simulation |
| T6.5 | Submission | form submitted with repo, video, live URL before 18:30 IST |

## 6. Testing, demo, submission and risks

All engine logic is pure functions tested with fixtures; only collectors touch the network, and they are tested twice: against recorded fixtures in CI and against mainnet as smoke tests.

### Testing strategy

| Layer | Tool | Runs | Scope |
| --- | --- | --- | --- |
| Unit | Vitest | Every push (CI) | Conversions, ratio, confidence, de-dup, rate limiter, alert rules, signing |
| Integration (mocked) | Vitest + `msw` | Every push (CI) | Each collector and Strike client against recorded JSON fixtures, retries on 429/5xx |
| Live smoke | Vitest, tag `@live` | Manually + hourly cron | Real mainnet reads; never blocks CI |
| Testnet | Vitest, tag `@testnet` | Manually | Builder Connect, balances, withdrawal |
| End-to-end | Playwright | Before each deploy | Dashboard loads, links, stale/failure states, mobile width |

Record fixtures once with a `scripts/record-fixtures.ts` run so CI never depends on the network. Commands: `npm test` (unit + integration), `npm run test:live`, `npm run test:testnet`, `npm run test:e2e`.

### Demo video script (2 minutes)

1. 0:00 Problem: Strike V2 trades off-chain; how do you know your money is there?
2. 0:15 Live dashboard: three lockers, reserves vs liabilities, Exact ratio, explorer links.
3. 0:40 "How we compute": every account read live from Strike's public API.
4. 0:55 Flow match: Strike-reported vs on-chain deposits per chain.
5. 1:10 My Safety: connect a wallet, see your balance backed and withdrawable.
6. 1:25 Simulation mode (labelled): inject an outflow, the Telegram alert fires live.
7. 1:45 Close: Strike's roadmap calls for independent validators; Watchtower is the first step.

### Submission checklist

- [ ] Public GitHub repo with MIT licence and README
- [ ] Live dashboard URL
- [ ] Demo video (YouTube unlisted or Loom)
- [ ] Project description: what it does and how it uses Strike
- [ ] All tests green in CI, badge in README
- [ ] Form submitted before Friday 18:30 IST
- [ ] Link posted in Strike Discord and shared with Shan

### Risks and fallbacks

| Risk | Impact | Fallback |
| --- | --- | --- |
| ABI/IDL arrive late | No event decoding | Monitor balance outflows only; events as roadmap |
| Ratio far from 100% on first scan | Looks like a false alarm | Check missing assets, sub-accounts, prices; ask Shan before showing it |
| Full scan too slow | Stale ratio | Run scan every 10 min; label refresh time honestly |
| Free RPC limits hit | Collector failures | Cache, lower frequency, second provider |
| Builder Connect issues | No My Safety | Public lookup by wallet address |
| Time overrun | Missing features | Cut order: M4, then M3; never cut M1, M2 or tests |
| Mixing up "Strike" (Jack Mallers' Bitcoin app) | Confused judges | Always say "Strike Finance" and link its docs |

## 7. Starter code (TypeScript)

These files are the P0–P2 core. They are written to be dropped into the repo as-is; the coding agent extends them. Pure logic lives in `packages/core` so it can be unit-tested without the network.

### Root `package.json` and `.env.example`

```json
{
  "name": "strike-watchtower",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "first-ratio": "tsx scripts/first-ratio.ts",
    "test": "vitest run --exclude '**/*.live.test.ts' --exclude '**/*.testnet.test.ts'",
    "test:live": "vitest run live",
    "test:testnet": "vitest run testnet",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "viem": "^2.21.0",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.8",
    "tweetnacl": "^1.0.3",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "msw": "^2.4.0",
    "@playwright/test": "^1.48.0"
  }
}
```

```bash
# .env.example
STRIKE_API=https://api.strikefinance.org
STRIKE_TESTNET_API=https://api-v2-testnet.strikefinance.org
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
BLOCKFROST_PROJECT_ID=mainnetYOUR_KEY
DATABASE_URL=postgres://...
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
STRIKE_RPS=40
```

### `packages/core/config.ts`

```ts
import 'dotenv/config';

export const LOCKERS = {
  ethereum: '0xbF4cFccd11257e568A936a7867D138f54A43cffa',
  solana: 'Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt', // TODO: confirm treasury PDA with corrected IDL
  cardano: 'addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3',
} as const;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Copy .env.example to .env and fill it.`);
  return v;
}

export const env = {
  strikeApi: process.env.STRIKE_API ?? 'https://api.strikefinance.org',
  ethRpc: () => need('ETH_RPC_URL'),
  solRpc: () => need('SOLANA_RPC_URL'),
  blockfrost: () => need('BLOCKFROST_PROJECT_ID'),
  rps: Number(process.env.STRIKE_RPS ?? 40),
};
```

### `packages/core/rateLimiter.ts`

```ts
/** Token bucket: at most `rps` calls start in any rolling second. */
export function createRateLimiter(rps: number, now = () => Date.now(), sleep = (ms: number) => new Promise(r => setTimeout(r, ms))) {
  const starts: number[] = [];
  return async function take(): Promise<void> {
    for (;;) {
      const t = now();
      while (starts.length && t - starts[0] >= 1000) starts.shift();
      if (starts.length < rps) { starts.push(t); return; }
      await sleep(1000 - (t - starts[0]) + 1);
    }
  };
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 300): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, baseMs * 2 ** i)); }
  }
  throw last;
}
```

### `packages/collectors/accounts.ts` (liabilities)

```ts
import { env } from '../core/config';
import { createRateLimiter, withRetry } from '../core/rateLimiter';

type LbEntry = { account_id: string; vault_id?: string };
type Account = { account_id: string; margin_balance: string; sub_accounts?: { account_id: string }[] };

export type LiabilityScan = { listed: number; read: number; failed: string[]; totalUsd: number; negative: string[]; ts: number };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export async function listAccounts(base = env.strikeApi): Promise<string[]> {
  const lb = await getJson<{ entries: LbEntry[] }>(`${base}/stat/v1/stats/leaderboard?time_range=all_time`);
  return [...new Set(lb.entries.map(e => e.account_id))];
}

export async function scanLiabilities(base = env.strikeApi, rps = env.rps): Promise<LiabilityScan> {
  const take = createRateLimiter(rps);
  const queue = await listAccounts(base);
  const seen = new Set<string>();
  const failed: string[] = []; const negative: string[] = [];
  let total = 0, read = 0;
  const listed = queue.length;

  async function one(id: string) {
    await take();
    const isVault = id.startsWith('vault_');
    const url = isVault
      ? `${base}/v2/account?vault_id=${encodeURIComponent(id.slice(6))}`
      : `${base}/v2/account?account_id=${encodeURIComponent(id)}`;
    try {
      const a = await withRetry(() => getJson<Account>(url));
      const v = Number(a.margin_balance);
      total += v; read++;
      if (v < 0) negative.push(id);
      for (const s of a.sub_accounts ?? []) if (!seen.has(s.account_id)) { seen.add(s.account_id); queue.push(s.account_id); }
    } catch { failed.push(id); }
  }

  for (const id of queue) seen.add(id);
  const workers = Array.from({ length: Math.min(rps, 20) }, async () => {
    while (queue.length) { const id = queue.shift()!; await one(id); }
  });
  await Promise.all(workers);
  return { listed, read, failed, totalUsd: total, negative, ts: Date.now() };
}
```

### `packages/collectors/ethereum.ts` (reserves + live safety state)

```ts
import { createPublicClient, http, erc20Abi, formatUnits, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import vaultAbi from './abi/ethereum-vault.json' assert { type: 'json' };
import { env, LOCKERS } from '../core/config';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const client = () => createPublicClient({ chain: mainnet, transport: http(env.ethRpc()) });
const vault = LOCKERS.ethereum as `0x${string}`;

export async function ethReserves() {
  const c = client();
  const [eth, usdcRaw, usdcDec] = await Promise.all([
    c.getBalance({ address: vault }),
    c.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }),
    c.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  // TODO: discover all whitelisted tokens from AssetWhitelisted events and read each.
  return [
    { chain: 'ethereum', asset: 'ETH', amount: Number(formatUnits(eth, 18)) },
    { chain: 'ethereum', asset: 'USDC', amount: Number(formatUnits(usdcRaw, usdcDec)) },
  ];
}

export async function ethSafetyState() {
  const c = client();
  const [paused, cfg] = await Promise.all([
    c.readContract({ address: vault, abi: vaultAbi, functionName: 'isPaused' }),
    c.readContract({ address: vault, abi: vaultAbi, functionName: 'largeWithdrawalConfig' }),
  ]) as [boolean, readonly [bigint, bigint, bigint, bigint]];
  return { paused, queueDelaySecs: Number(cfg[1]), maxPending: Number(cfg[2]), pendingCount: Number(cfg[3]) };
}

export const SAFETY_EVENTS = [
  'LargeWithdrawalQueued', 'LargeWithdrawalExecuted', 'LargeWithdrawalCancelled',
  'Paused', 'Unpaused', 'ActionProposed', 'ActionFinalized', 'ActionCancelled',
  'Upgraded', 'RateLimitUpdated', 'RoleMembersUpdated', 'AdminWithdrawERC20', 'AdminWithdrawETH',
] as const;

export async function ethSafetyEvents(fromBlock: bigint, toBlock: bigint) {
  const c = client();
  const logs = await c.getContractEvents({ address: vault, abi: vaultAbi, fromBlock, toBlock });
  return logs.filter(l => (SAFETY_EVENTS as readonly string[]).includes(l.eventName as string));
}
```

### `packages/collectors/cardano.ts`

```ts
import { env, LOCKERS } from '../core/config';

const BF = 'https://cardano-mainnet.blockfrost.io/api/v0';

export async function cardanoReserves() {
  const res = await fetch(`${BF}/addresses/${LOCKERS.cardano}`, { headers: { project_id: env.blockfrost() } });
  if (!res.ok) throw new Error(`Blockfrost ${res.status}`);
  const body = await res.json() as { amount: { unit: string; quantity: string }[] };
  return body.amount.map(a => a.unit === 'lovelace'
    ? { chain: 'cardano', asset: 'ADA', amount: Number(BigInt(a.quantity)) / 1e6 }
    : { chain: 'cardano', asset: a.unit, amount: Number(a.quantity) }); // TODO: native-token decimals via /assets/{unit}
}
```

### `packages/collectors/solana.ts` (pending corrected IDL)

```ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { env, LOCKERS } from '../core/config';

// Reads SOL + every SPL token account owned by the locker/treasury address.
// When the corrected IDL arrives: decode VaultState (paused, pending_withdrawal_count, usage windows).
export async function solanaReserves() {
  const conn = new Connection(env.solRpc(), 'confirmed');
  const owner = new PublicKey(LOCKERS.solana);
  const [lamports, tokens] = await Promise.all([
    conn.getBalance(owner),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
  ]);
  const out = [{ chain: 'solana', asset: 'SOL', amount: lamports / LAMPORTS_PER_SOL }];
  for (const t of tokens.value) {
    const info = (t.account.data as any).parsed.info;
    out.push({ chain: 'solana', asset: info.mint, amount: Number(info.tokenAmount.uiAmountString) });
  }
  return out;
}
```

### `packages/core/ratio.ts` and `flowMatch.ts` (pure, unit-tested)

```ts
export type Confidence = 'Exact' | 'Partial' | 'Stale';

export function reserveRatio(reservesUsd: number, liabilitiesUsd: number): number | undefined {
  if (!(liabilitiesUsd > 0)) return undefined;
  return reservesUsd / liabilitiesUsd;
}

export function confidence(listed: number, read: number, ageMs: number): { label: Confidence; failed: number } {
  if (ageMs > 10 * 60_000) return { label: 'Stale', failed: listed - read };
  return read >= listed ? { label: 'Exact', failed: 0 } : { label: 'Partial', failed: listed - read };
}

export function usdValue(amount: number, price: number): number {
  return Math.round(amount * price * 100) / 100;
}

// flowMatch.ts
export function flowMatch(reported: number, onchain: number, tolerance = 0.01) {
  if (reported === 0 && onchain === 0) return { matchPct: 100, mismatch: false };
  const base = Math.max(Math.abs(reported), Math.abs(onchain));
  const diff = Math.abs(reported - onchain) / base;
  return { matchPct: Math.round((1 - diff) * 10000) / 100, mismatch: diff > tolerance };
}
```

### `packages/alerts/rules.ts`

```ts
export type Alert = { rule: string; severity: 'info' | 'warn' | 'critical'; message: string; key: string; simulated: boolean };

export function evaluate(s: {
  ratio?: number; flowMismatch: { chain: string; pct: number }[]; paused: boolean;
  queued: { id: string; amountUsd: number }[]; actions: { id: string; kind: string }[];
  outflow1hUsd: number; avgHourlyOutflowUsd: number; simulated?: boolean;
}): Alert[] {
  const sim = !!s.simulated; const tag = sim ? '[SIMULATION] ' : '';
  const a: Alert[] = [];
  if (s.ratio !== undefined && s.ratio < 1) a.push({ rule: 'ratio_below_100', severity: 'critical', message: `${tag}Reserve ratio ${(s.ratio * 100).toFixed(2)}%`, key: 'ratio', simulated: sim });
  for (const f of s.flowMismatch) a.push({ rule: 'flow_mismatch', severity: 'warn', message: `${tag}${f.chain} flow match ${f.pct}%`, key: `flow:${f.chain}`, simulated: sim });
  if (s.paused) a.push({ rule: 'paused', severity: 'critical', message: `${tag}Vault paused`, key: 'paused', simulated: sim });
  for (const q of s.queued) a.push({ rule: 'large_withdrawal_queued', severity: 'warn', message: `${tag}Large withdrawal queued: $${q.amountUsd.toLocaleString()}`, key: `queued:${q.id}`, simulated: sim });
  for (const x of s.actions) a.push({ rule: 'timelock_action', severity: 'warn', message: `${tag}Timelocked change proposed: ${x.kind}`, key: `action:${x.id}`, simulated: sim });
  if (s.avgHourlyOutflowUsd > 0 && s.outflow1hUsd > 3 * s.avgHourlyOutflowUsd) a.push({ rule: 'outflow_spike', severity: 'warn', message: `${tag}1h outflow $${s.outflow1hUsd.toLocaleString()} is >3x average`, key: `spike:${Math.floor(Date.now() / 3_600_000)}`, simulated: sim });
  return a;
}

export function dedupe(alerts: Alert[], sent: Set<string>): Alert[] {
  return alerts.filter(x => { const k = `${x.rule}|${x.key}|${x.simulated}`; if (sent.has(k)) return false; sent.add(k); return true; });
}
```

### `scripts/first-ratio.ts` (P0 exit gate)

```ts
import { scanLiabilities } from '../packages/collectors/accounts';
import { ethReserves } from '../packages/collectors/ethereum';
import { cardanoReserves } from '../packages/collectors/cardano';
import { solanaReserves } from '../packages/collectors/solana';

const PRICE_URL = 'https://api.strikefinance.org/price'; // TODO: confirm exact ticker path from market-api docs
const STABLE = new Set(['USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']); // USDC on ETH + Solana mint

async function main() {
  const [eth, ada, sol, liab] = await Promise.all([ethReserves(), cardanoReserves(), solanaReserves(), scanLiabilities()]);
  const all = [...eth, ...ada, ...sol];
  console.table(all);
  console.log('Liabilities:', liab);
  console.log('Price ADA/ETH/SOL from', PRICE_URL, 'then compute ratio = reservesUsd / liab.totalUsd');
}
main().catch(e => { console.error(e); process.exit(1); });
```

### Example tests (`tests/unit/core.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { reserveRatio, confidence, usdValue, flowMatch } from '../../packages/core/ratio';
import { evaluate, dedupe } from '../../packages/alerts/rules';
import { createRateLimiter } from '../../packages/core/rateLimiter';

describe('ratio (T2.1, T2.2)', () => {
  it('computes', () => expect(reserveRatio(1010, 1000)).toBeCloseTo(1.01));
  it('no Infinity on zero liabilities', () => expect(reserveRatio(5, 0)).toBeUndefined());
  it('labels', () => {
    expect(confidence(10, 10, 1000).label).toBe('Exact');
    expect(confidence(10, 8, 1000)).toEqual({ label: 'Partial', failed: 2 });
    expect(confidence(10, 10, 11 * 60_000).label).toBe('Stale');
  });
});

describe('valuation and flow (T1.2, T2.7)', () => {
  it('usd', () => expect(usdValue(2.5, 0.3456)).toBe(0.86));
  it('flow ok', () => expect(flowMatch(1000, 1000).mismatch).toBe(false));
  it('flow mismatch', () => expect(flowMatch(1000, 980).mismatch).toBe(true));
});

describe('alerts (T4.2–T4.4)', () => {
  const clean = { ratio: 1.02, flowMismatch: [], paused: false, queued: [], actions: [], outflow1hUsd: 10, avgHourlyOutflowUsd: 10 };
  it('silent when clean', () => expect(evaluate(clean)).toHaveLength(0));
  it('fires on pause, tagged in sim', () => {
    const a = evaluate({ ...clean, paused: true, simulated: true });
    expect(a[0].message.startsWith('[SIMULATION]')).toBe(true);
  });
  it('dedupes', () => {
    const s = new Set<string>(); const a = evaluate({ ...clean, paused: true });
    expect(dedupe(a, s)).toHaveLength(1); expect(dedupe(a, s)).toHaveLength(0);
  });
});

describe('rate limiter (T2.5)', () => {
  it('never more than rps per second', async () => {
    let t = 0; const starts: number[] = [];
    const take = createRateLimiter(40, () => t, async ms => { t += ms; });
    for (let i = 0; i < 100; i++) { await take(); starts.push(t); }
    for (const s of starts) expect(starts.filter(x => x >= s && x < s + 1000).length).toBeLessThanOrEqual(40);
  });
});
```

### Known TODOs for the coding agent

- Confirm the exact Strike price endpoint path from the market-data docs before using it.
- Discover every whitelisted Ethereum token from `AssetWhitelisted` events instead of hard-coding USDC.
- Read Cardano native-token decimals from Blockfrost `/assets/{unit}`.
- Replace the Solana address and add `VaultState` decoding once the corrected IDL arrives.
- Verify the leaderboard full-list response shape on a live call before trusting field names.

## 8. Final updates (22 Oct, 02:00 IST)

### Name

The product is **ZeroGap** ("Strike Watchtower" was the working name). Tagline: "Every dollar on Strike, proven on-chain." The footer must say: independent project, not affiliated with Strike Finance.

### Liabilities formula (superseded by Section 9: rewards are excluded)

```
liabilities = Σ margin_balance (all non-vault accounts + sub-accounts)
            + Σ stakingRewardBalance (/v2/balances)
            + referral rewards (endpoint pending from Strike)
reserves    = ETH vault + Solana treasury + Cardano deposit script + Cardano protocol script, priced in USD
ratio       = reserves ÷ liabilities   (target exactly 100.00%)
```

- Exclude ALL vault accounts (double counting otherwise, ~170% too high).
- sUSDrf, iUSD and LP tokens are never priced at $1; the price API is coming from Strike. Until then: an "unpriced" line.
- Pending components show as "Known unexposed liabilities" and must not trigger Drift/Needs review.

### UI/UX (design canvas "ZeroGap UI")

| Screen | Route | Purpose |
| --- | --- | --- |
| Landing | `/` | Hero "Reserves on chain. Gap at zero.", stats row, how it works, features, chains, CTA |
| Dashboard | `/dashboard` | Ratio + deviation scale, reserves vs liabilities, chain cards with explorer links, liabilities table, flow match, safety controls, events |
| My Safety | `/me` | Wallet connect, account value, withdrawable now, 4 checks, withdraw shortcut (user signs) |
| Telegram alert | bot | Balanced message + large-withdrawal alert |

Design tokens: ground #060B0A (grid texture rgba(74,222,128,0.06), 48–56 px) · card #0B1714 · border #173129 · accent/Balanced #4ADE80 · Drift/pending #E8C46A · liabilities bar #5E8BFF · fonts Space Grotesk (UI) and JetBrains Mono (numbers).

UX rules: the ratio is the first thing seen; both ends of the scale are bad; every number has a source link and timestamp; sample or simulated data is always labelled; touch targets ≥ 44 px; works at phone width.

## 9. Founder update (22 Oct, 13:12–14:30 IST)

- **Solana:** USDC sits in `BT85fgyhyZhCtaNdciKEGoj7mU8E3EeFijPy6XCmCAA6`. The IDL (program `7XASQ24fiwoNHmTnQdi3k3WXMUXRaj7MdcHvkSducrB8`) is correct; only its metadata was wrong (now `strike_vault`). Read both `Dj9NkHy…` and `BT85fg…`, de-duplicated.
- **Prices:** `GET /v2/credit/collateral-assets` gives a USD price (+ `price_fresh`, `price_expires_at`) for ADA, sUSDrf, LP_SUNDAE_USDCx_USDM and SCALED_AAVE_V3_ETH_aUSDC (USD per scaled unit, above $1). `GET /v2/credit/settings` gives `custody_asset_mappings` (on-chain asset → collateral ID, `raw_amount_scale`).
- **Rewards: DISCOUNT them.** Staking and referral rewards are tradeable only, not withdrawable, so they are NOT liabilities against the lockers. Remove the staking-rewards line; referral rewards are not needed.
- **Expected gap today:** a few $K missing is known: a large LP withdrawal on Ethereum, and Cardano users depositing USDCx and withdrawing USDC, with funds in transit in the IOG bridge. Label it "Known in-transit", not insolvency.
- **Target by hackathon end:** within a few hundred dollars (as low as ~$10), explained by price moves between scans. Show the gap in USD as well as %.

- [x] Corrected Solana IDL
- [x] Price source for sUSDrf / LP tokens
- [x] Rewards decision (excluded)
