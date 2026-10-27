# GapWise — 3-minute demo script

Setup before recording: `npm start` (server + engine) with the latest scan loaded, dashboard open at
`http://localhost:8787/dashboard#why`. If Meterless/Nemotron or Zetaris are not available, say so on camera: the panel
shows the **rules-only** badge and the integration status line; do not present it as an AI run.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:20 | Landing page | "Platforms that hold user money publish one number: reserves versus what they owe. When those differ, someone has to find out why, by hand, across five different data sources. GapWise is an AI agent that does that investigation and shows the evidence for every claim." |
| 0:20–0:45 | Dashboard overview: ratio, reserves, liabilities, scan timestamp | "This is a real scan of Strike Finance: lockers read from Ethereum, Solana and Cardano, 3,487 accounts read from Strike's API, one price snapshot. Reserves are short of what is owed by the amount shown. Every input is in a hashed report anyone can reproduce with `npm run verify`." |
| 0:45–1:30 | "Why is there a gap?" → press **Investigate gap**; show running state, then the integration line (Meterless / Zetaris / H-MEM) and the tool-call list | "The investigator recalls past findings from memory, queries scan history (Zetaris SQL when connected), tests every known cause in code, then the model, served through the Meterless runtime, can query more evidence with read-only tools before it explains. Here are the tools it called." |
| 1:30–2:15 | Expand causes: a confirmed one (vault surplus), the ruled-out ones (isolated margin, relayed deposits, commission), the hypotheses (staking backing, market-maker bot), then the unexplained amount | "Each cause is labelled: confirmed, supported, hypothesis, unresolved or ruled out, with the calculation and links. Isolated margin, the cause of a real $77K error we found earlier, is ruled out because it is now counted. The amount nothing confirms stays as unexplained. The agent is not allowed to make it disappear." |
| 2:15–2:40 | "What changed since the previous scan" bars with remainder $0; click the report hash | "Between scans the change splits exactly into price moves, locker balance changes and liability changes, with zero remainder. All arithmetic is in code; the model cannot introduce a number. Invented evidence ids or amounts are rejected." |
| 2:40–3:00 | Next check + Telegram alert with the "Why:" paragraph | "Instead of a bare red number, an analyst gets a ranked list of causes, the evidence, what is still unknown and the next check to run. GapWise: understand every gap, trust every finding." |

Fallback if live services are down: run `npm run investigate` on the latest saved report and show the JSON plus the
panel. Say clearly that the result is rules-only and which integration was unavailable.
