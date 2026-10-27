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
| 9 | Zetaris live: tables published, ≥1 real query used in an investigation | `store.ts`, `scripts/zetaris-setup.ts`, `zetarisHistory`, `runSql` tool | Local Zetaris 2.4.3: datasource `gapwise` registered, 9 reports / 18,741 rows; investigation 15:09 UTC read history via Zetaris and Nemotron ran 3 `runSql` queries (`output_examples/live_zetaris_nemotron.*`) | PASS |
| 10 | Meterless runtime client | `packages/agent/llm.ts` | Mocked tests (headers, `/v1/models` status, placeholder token) | PASS (offline) |
| 11 | Meterless Nightshift as primary AI provider, live | `llm.ts` | Nightshift 0.6.2 runtime, route `meterless/deep`, tool calls; every model call in the live runs went through it | PASS |
| 12 | NVIDIA Nemotron verified through Nightshift, model logged per request | `nemotron_verified`, `trace.ts` | `nvidia/nemotron-3.5-bolt-e4b` in every `nightshift_request` trace line; `nemotron_verified: true` | PASS |
| 13 | Meterless H-MEM memory | `packages/agent/memory.ts`, `hmem/` (vendored reference) | Test "seeds H-MEM once…"; live run recalled 4 seeded findings | PASS (reference implementation, not a hosted service) |
| 14 | Cursor used during development | — | This work was done with Claude Code, not Cursor. Course page says "Cursor or any AI coding tool" | PASS (official guide: "Cursor is optional") |
| 15 | Dashboard panel "Why is there a gap?" | `apps/web/dashboard.html`, `assets/why.js` | Screenshot from local server | PASS (local); published Vercel view shows the last published investigation (needs a deploy) |
| 16 | API `GET /api/why`, `POST /api/why/run` | `apps/server/server.ts`, `api/why.ts` | Local curl | PASS (local) |
| 17 | Telegram explanation in alerts | `packages/alerts/telegram.ts`, `engine.ts` | Unit test; not sent live (tests never send) | PASS (offline) |
| 18 | Existing checks still pass | — | `npm test`, `npm run typecheck`, `npm run verify` (see final report) | PASS |
| 19 | README, demo script, slide outline, changelog | `README.md`, `docs/hackathon/*` | Files present | PASS |
| 20 | Slide deck file (.pptx) | `submission/GapWise.pptx` | 8 slides: problem/users, solution, agent workflow, evidence, sponsor tech, stack, new vs existing, next | PASS |
| 21 | Demo video (1–4 min) | — | Not recorded | NOT STARTED |
| 22 | Deployed GapWise build; public repo | https://gapwise-agent.vercel.app, https://github.com/Lakshmikanth-3/GapWise | Site and repo public (gapwise.vercel.app is owned by another account) | PASS |
| 25 | Programmatic entry, sample mode, examples, traces (pre-submission self-check) | `POST /run`, `SAMPLE_MODE`, `input_examples/`, `output_examples/`, `logs/` | Three examples give three different results with no credentials; traces show 5 named agents and the validator loop | PASS |
| 23 | Submission in the portal before 27 Oct 23:45 UTC | — | Manual step by the team | NOT STARTED |
| 24 | Official judging criteria and weights | — | Welcome Guide: Impact 30, Technical 20, Innovation 15, Demo 15, Product & UX 10, Sponsor Tech 10 | PASS (known) |

## Still to do (manual)

- Record the demo video (1–4 minutes) following `DEMO-SCRIPT.md`; show no credentials (Nightshift Providers tab, `.env`).
- Submit on HackOS: Track 02, repository and site links, video, `submission/GapWise.pptx`, the sponsor explanation
  (README "Sponsor technology"), and declare the reserve monitor (data collectors, reserve maths, reports, dashboard base; commits before 22 Oct) as pre-existing.
