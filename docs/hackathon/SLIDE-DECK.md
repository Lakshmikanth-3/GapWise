# GapWise — slide outline (6 slides)

1. **GapWise: Understand every gap. Trust every finding.**
   An AI agent that checks whether a financial platform actually holds the money it owes its users. It combines 5+
   data sources, finds mismatches, and explains why, with evidence for every claim. Track 02: "The Agent That Can
   Explain Why". Independent project, not affiliated with Strike Finance.

2. **The problem.** A reserve ratio says *that* there is a gap, never *why*. On Strike Finance the inputs are split
   across Ethereum, Solana and Cardano ledgers, a trading API with 3,487 accounts, vault depositor lists, price feeds and
   an external market-maker account. A person reconciling them by hand needed days per question (our own 23 Oct
   investigation: `docs/GAP-INVESTIGATION.md`). Users of the platform, the platform itself and auditors all need the answer.

3. **How it works.** Collectors (pre-existing) → verified, hashed report → Zetaris tables → Gap Investigator:
   recall memory (H-MEM) → query history (SQL) → test hypotheses in code → model (Meterless runtime, Nemotron) calls
   read-only tools → validated, cited answer → dashboard, API, Telegram.

4. **Evidence, not vibes.** Every cause: status (confirmed / supported / hypothesis / unresolved / ruled out), amount
   computed in code, calculation, evidence ids (SQL, tx hash, report field). Unexplained amount is never forced to zero.
   Change since the previous scan reconciles exactly. Model output with unknown ids, invented amounts or "fully
   explained" claims is rejected; if the AI is down the result is labelled rules-only.

5. **Sponsor technology, honestly.** Zetaris: SQL data layer for scan history and the model's `runSql` tool.
   Meterless: inference runtime + H-MEM memory. NVIDIA Nemotron: the model loaded in the Meterless fleet, verified from
   the runtime response. Status of each live integration: see `docs/hackathon/REQUIREMENTS-MATRIX.md`.

6. **What is new vs what existed.** Existing: the ZeroGap monitor (collectors, ratio, reports, dashboard, alerts).
   New this week: the agent, the tools, Zetaris layer, Meterless client, memory, validation, "Why is there a gap?" panel,
   API, Telegram explanation, 24 tests. Limits: live sponsor integrations need credentials (see matrix); the cause of the
   current gap is still open with Strike.

The actual deck file has not been created; build it from this outline.
