// Agent trace: one JSON line per step, to stdout and logs/<investigation_id>.jsonl. Written by the code as it runs;
// never hand-written. Agent names are the investigator's stages, each implemented by a distinct function:
//   PlannerAgent    investigate()          orchestrates, decides which stages run
//   EvidenceAgent   analyzeGap / Zetaris   gathers history and tests the 13 hypotheses in code
//   MemoryAgent     GapMemory (H-MEM)      recalls past findings, saves the new one
//   ExplainerAgent  Meterless/Nightshift   model loop with read-only tools
//   ValidatorAgent  applyAnswer            rejects unsupported ids/amounts, asks the explainer to revise
import { appendFileSync, mkdirSync } from 'node:fs';

export type TraceEvent = {
  agent_name: 'PlannerAgent' | 'EvidenceAgent' | 'MemoryAgent' | 'ExplainerAgent' | 'ValidatorAgent';
  action: string; input_summary: string; output_summary: string;
  target_agent?: string; model?: string | null; retry_count?: number; ms?: number;
  status: 'success' | 'failed' | 'needs_revision' | 'skipped';
};

export class Trace {
  readonly events: (TraceEvent & { timestamp: string; investigation_id: string })[] = [];
  private file?: string;
  constructor(readonly investigationId: string, opts: { dir?: string; quiet?: boolean } = {}) {
    const dir = opts.dir ?? process.env.GAPWISE_LOG_DIR ?? (process.env.VITEST ? 'off' : 'logs');
    if (dir !== 'off') { try { mkdirSync(dir, { recursive: true }); this.file = `${dir}/${investigationId}.jsonl`; } catch { /* logging must never break a run */ } }
    this.quiet = opts.quiet ?? !!process.env.VITEST;
  }
  private quiet: boolean;
  log(e: TraceEvent) {
    const line = { timestamp: new Date().toISOString(), investigation_id: this.investigationId, ...e };
    this.events.push(line);
    const s = JSON.stringify(line);
    if (!this.quiet) console.log(s);
    if (this.file) { try { appendFileSync(this.file, s + '\n'); } catch { /* ignore */ } }
  }
}
