# GapWise changelog (Open Agent Hackathon 2026, 22–27 Oct 2026)

Everything below was built during the hackathon window on top of the existing ZeroGap monitor. The monitor itself
(collectors, ratio maths, reports, dashboard, Telegram alerts, My Safety) existed before and is unchanged: no formula,
exclusion rule or collector was modified.

## New

- **Gap Investigator agent** (`packages/agent/`)
  - `evidence.ts`: deterministic hypothesis testing in code. Tests 8+ causes (bridge in transit, price movement,
    isolated margin, relayed deposits, market-maker bot counterparty, commission pending, single locker change, large
    withdrawal, scan-window timing, staking backing, vault surplus, unpriced/placeholder prices, failed accounts). Each
    cause has a status (confirmed / supported inference / hypothesis / unresolved / ruled out), a USD amount computed
    in code, a calculation string and evidence (`sql` / `tx` / `source`). `unexplained_usd = gap − Σ attributed` is
    never forced to zero. A second ledger decomposes the change since the previous scan exactly (price effect,
    quantity effect per locker row, liability components).
  - `investigate.ts`: orchestration: recall memory, query history (Zetaris SQL, local reports as fallback), run the
    tests, then a bounded tool-calling loop on the model (max `GAPWISE_MAX_STEPS`), then validation: unknown evidence ids,
    unknown causes, dollar amounts that the code did not compute and "fully explained" claims are rejected. AI failure
    gives a labelled `rules_only: true` result, never a canned answer.
  - `tools.ts`: allowlisted read-only tools `runSql`, `getLatestReport`, `compareScans`, `lookupTx`, `recallMemory` with
    argument validation and bounded output.
  - `llm.ts`: Meterless runtime client (OpenAI-compatible, documented headers, `/v1/models` status, 180 s timeout). Reports
    the served model from the response; "Nemotron verified" only when that names Nemotron.
  - `memory.ts` + `hmem/`: Meterless H-MEM reference implementation (vendored unmodified, Apache-2.0), seeded with past
    confirmed findings from `docs/GAP-INVESTIGATION.md` / `docs/DECISIONS.md`; each investigation is saved.
- **Zetaris data layer** (`packages/zetaris/`): typed client following Zetaris' getting-started helper (login, bearer +
  `X-Org-ID` + `X-Request-ID`, `/api/proxy/sql-editor/sqls/run-query`, 30 s timeout), a SQL guard for model-written
  queries (one SELECT/WITH, GapWise tables only, no comments/DDL/DML, enforced LIMIT), query log
  (`data/zetaris-queries.jsonl`), and builders for the six tables (`scans`, `reserves`, `liabilities`, `prices`, `flows`,
  `safety_events`) published after each scan. DDL: `docs/zetaris/schema.sql`.
- **API**: `GET /api/why`, `POST /api/why/run` (one at a time, rate-limited), `GET /api/why/status`; `api/why.ts` for the
  published deployment.
- **Engine**: publishes each scan to Zetaris when configured; auto-investigates scans that are not Balanced (deduplicated
  by interval and gap movement).
- **Dashboard**: "Why is there a gap?" panel (`apps/web/assets/why.js`): verdict, totals (gap / explained / unexplained),
  one bar per cause with status chip and confidence, expandable evidence with links, change-since-previous-scan bars,
  sources, memory, tool calls, warnings, rules-only badge, model name, integration status, loading/empty/error/retry.
- **Telegram**: alerts are prefixed "GapWise" and ratio alerts carry the investigator's one-paragraph explanation.
- **CLI**: `npm run investigate` (`--fresh` runs a live scan first, `--report <file>`, `--publish`).
- **Tests**: `tests/unit/gapwise.test.ts` (24 tests, offline, mocked Zetaris + Meterless).
- **Rebrand**: GapWise in page titles, headers, landing copy, package name/description, Telegram prefix, server log.
  Kept: repo name, URLs, `zerogap` CLI bin, `ZEROGAP_*` env vars, builder code `zerogap` (registered with Strike).

## Unchanged (pre-existing ZeroGap)

Collectors for Ethereum, Solana, Cardano, Strike API and the market-maker bot; valuation; liabilities formula; ratio
bands; `npm run verify` and its report format/hash; flow match; safety events; alert rules; My Safety; Vercel API.
