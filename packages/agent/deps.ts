// Builds the investigator's dependencies from .env. Anything not configured is simply absent (and reported as such),
// never replaced by a stand-in.
import { ZetarisClient, zetarisFromEnv } from '../zetaris/client';
import type { InvestigateDeps } from './investigate';
import { loadReports } from './investigate';
import { MeterlessClient, meterlessFromEnv, type RuntimeStatus } from './llm';
import { GapMemory } from './memory';
import { ethLockerEvents, ethLookupTx, solLookupTx } from './tools';

export type IntegrationStatus = {
  meterless: RuntimeStatus & { requested_model?: string };
  zetaris: { state: 'online' | 'error' | 'not configured'; detail?: string; schema?: string };
  memory: { state: 'on'; records: number };
};

export async function depsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<InvestigateDeps & { meterless?: MeterlessClient }> {
  const m = meterlessFromEnv(env);
  const z = zetarisFromEnv(env);
  const meterless = m ? new MeterlessClient(m) : undefined;
  return {
    llm: meterless, meterless,
    zetaris: z ? new ZetarisClient(z) : undefined,
    memory: new GapMemory(),
    reports: await loadReports(),
    lockerEvents: env.GAPWISE_CHAIN_LOOKUPS === 'off' ? undefined : ethLockerEvents,
    lookupTx: (chain, hash) => (chain === 'ethereum' ? ethLookupTx(hash) : solLookupTx(hash)),
  };
}

export async function integrationStatus(d: Awaited<ReturnType<typeof depsFromEnv>>): Promise<IntegrationStatus> {
  const meterless = d.meterless ? { ...(await d.meterless.status()), requested_model: d.meterless.requestedModel } : { state: 'not configured' as const, detail: 'METERLESS_TOKEN not set and no local runtime token found' };
  let zetaris: IntegrationStatus['zetaris'] = { state: 'not configured', detail: 'ZETARIS_BASE_URL / ZETARIS_ORG_ID / credentials not set' };
  if (d.zetaris) {
    try { const p = await d.zetaris.ping(); zetaris = { state: 'online', detail: `${p.databases} Lightning database(s) visible`, schema: d.zetaris.cfg.schema }; }
    catch (e) { zetaris = { state: 'error', detail: (e as Error).message.slice(0, 200), schema: d.zetaris.cfg.schema }; }
  }
  return { meterless, zetaris, memory: { state: 'on', records: d.memory?.hmem.store.all().length ?? 0 } };
}
