# Requirements matrix — GapWise (Open Agent Hackathon 2026)

Checked 27 Oct 2026 against the public pages: hackathon.genai.works (event summary: build window 22–27 Oct, teams 1–5,
"registration closes Oct 27, 23:45 UTC") and academy.genai.works/courses/open-agent-hackathon-2026/details (tracks:
"Solving Fragmented Intelligence", "The Agent That Can Explain Why", "Reasoning Architecture", "Bring Your Own
Project (Tinkerer)"; sponsor technologies Zetaris, Cursor, Meterless, NVIDIA Nemotron; DGX Spark prize for best use of
Nemotron). **Not found publicly:** detailed per-track mandatory requirements, judging weights, submission form fields,
video length, rules on existing projects. Those rows are marked BLOCKED until the official rules are read in the
submission portal.

Status: PASS = implemented and verified by tests or a real run · FAIL · BLOCKED = needs an account, key, runtime or
manual step · NOT STARTED.

| # | Requirement | Where | Evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | Track choice: "The Agent That Can Explain Why" (Track 02); one track only | README, this file | Agent explains why reserves ≠ liabilities with cited evidence | PASS (choice made; the Tinkerer track may fit an existing-project extension better: confirm in the portal rules) |
| 2 | Agent investigates across multiple sources | `packages/agent/investigate.ts`, `evidence.ts` | Live run: Ethereum, Solana, Cardano lockers, Strike API accounts/vaults/prices, market-maker bot, previous scan, H-MEM, Ethereum locker logs | PASS |
| 3 | Connects findings into an explanation | `rulesVerdict`, model loop | Verdict + change decomposition (remainder $0 on real data, test) | PASS |
| 4 | Evidence for every claim; unsupported claims rejected | `applyAnswer`, `unsupportedAmounts` | `tests/unit/gapwise.test.ts` "rejects fabricated evidence ids…", "ignores instructions injected…" | PASS |
| 5 | Deterministic arithmetic, honest unexplained remainder | `analyzeGap` | Tests "cannot explain the real −$14.7K gap", "attributes a gap correctly" | PASS |
| 6 | Read-only, allowlisted, validated tools; bounded loop | `tools.ts`, `guardSql`, `MAX_STEPS` | Tests "reject unsafe SQL", "validate arguments…" | PASS |
| 7 | AI-down fallback labelled rules-only | `investigate.ts` | Test "falls back to rules-only…"; live run today was rules-only (no runtime) | PASS |
| 8 | Zetaris adapter (auth, query, validation, timeouts, logging) | `packages/zetaris/client.ts` | Mocked tests (headers, login, HTTP error, response shapes) | PASS (offline) |
| 9 | Zetaris live: tables published, ≥1 real query used in an investigation | `tables.ts`, `zetarisHistory` | No Zetaris instance or credentials on this machine (`ZETARIS_BASE_URL`, `ZETARIS_ORG_ID`, `ZETARIS_API_KEY` or username/password unset); tables not created (`docs/zetaris/schema.sql`) | **BLOCKED** |
| 10 | Meterless runtime client | `packages/agent/llm.ts` | Mocked tests (headers, `/v1/models` status, placeholder token) | PASS (offline) |
| 11 | Meterless live inference | `llm.ts` | Runtime not installed here (`127.0.0.1:8088` refused; no `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token`) | **BLOCKED** |
| 12 | NVIDIA Nemotron verified through Meterless | `nemotron_verified` from `response.model` | Meterless docs list routing modes only; Nemotron must be loaded in the Nightshift fleet. Not verified | **BLOCKED** |
| 13 | Meterless H-MEM memory | `packages/agent/memory.ts`, `hmem/` (vendored reference) | Test "seeds H-MEM once…"; live run recalled 4 seeded findings | PASS (reference implementation, not a hosted service) |
| 14 | Cursor used during development | — | This work was done with Claude Code, not Cursor. Course page says "Cursor or any AI coding tool" | BLOCKED (confirm whether Cursor is mandatory) |
| 15 | Dashboard panel "Why is there a gap?" | `apps/web/dashboard.html`, `assets/why.js` | Screenshot from local server | PASS (local); published Vercel view shows the last published investigation (needs a deploy) |
| 16 | API `GET /api/why`, `POST /api/why/run` | `apps/server/server.ts`, `api/why.ts` | Local curl | PASS (local) |
| 17 | Telegram explanation in alerts | `packages/alerts/telegram.ts`, `engine.ts` | Unit test; not sent live (tests never send) | PASS (offline) |
| 18 | Existing checks still pass | — | `npm test`, `npm run typecheck`, `npm run verify` (see final report) | PASS |
| 19 | README, demo script, slide outline, changelog | `README.md`, `docs/hackathon/*` | Files present | PASS |
| 20 | Slide deck file (.pptx) | — | Outline only | NOT STARTED |
| 21 | Demo video | — | Not recorded | NOT STARTED |
| 22 | Deployed GapWise build | — | Existing Vercel deploy still shows the previous build; nothing pushed (owner instruction) | BLOCKED |
| 23 | Submission in the portal before 27 Oct 23:45 UTC | — | Manual step by the team | NOT STARTED |
| 24 | Official judging criteria and weights | — | Not on the public pages | BLOCKED |

## What is needed to unblock

- **Zetaris:** an instance URL (UI origin), numeric org id, API key or username/password; a writable data source in
  Zetaris with the six tables from `docs/zetaris/schema.sql`. Then `npm run investigate -- --fresh --publish`.
- **Meterless + Nemotron:** install Nightshift (Windows 1.2.1), load an NVIDIA Nemotron model in the fleet, then
  `ns status --json`; GapWise reads the token automatically. Run `npm run investigate` and check
  `inference.nemotron_verified: true`.
- **Push/deploy:** the owner asked for nothing to be pushed. The new target repository is
  https://github.com/Lakshmikanth-3/GapWise. Adding it as a remote and pushing need the owner's go-ahead.
