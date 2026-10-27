// Meterless runtime client (OpenAI-compatible), per meterless.ai/engines.html and Meterless docs/agent-ready/add-meterless-provider.md:
//   base http://127.0.0.1:8088/v1 · Authorization: Bearer <runtime token> · meterless-app: <app id> · meterless-scope: user (chat)
//   GET /v1/models decides status (200 online · 401/403 unauthorized · else offline) · 180 s timeout (cold model loads).
// Model ids are routing modes (meterless/text.deep …): the runtime routes to the fleet loaded in Nightshift. Which model
// actually answered is read from the response's `model` field; GapWise only reports "Nemotron verified" when that field
// names Nemotron, never because of configuration alone.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ChatResult = { message: { content: string | null; tool_calls?: ToolCall[] }; model: string | null };

export interface LlmClient {
  readonly requestedModel: string;
  chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<ChatResult>;
}

export type MeterlessConfig = { baseUrl: string; token: string; model: string; app: string; timeoutMs: number };
export type RuntimeStatus = { state: 'online' | 'unauthorized' | 'offline' | 'not configured'; models?: string[]; detail?: string };

export const NEMOTRON = /nemotron/i;

function tokenFromRuntime(env: NodeJS.ProcessEnv): string | undefined {
  const dirs = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'ai.meterless.runtime'), '/var/lib/meterless', env.HOME && join(env.HOME, 'Library', 'Application Support', 'ai.meterless.runtime')].filter(Boolean) as string[];
  for (const d of dirs) { const f = join(d, 'proxy-token'); if (existsSync(f)) return readFileSync(f, 'utf8').trim() || undefined; }
  return undefined;
}

export function meterlessFromEnv(env: NodeJS.ProcessEnv = process.env): MeterlessConfig | undefined {
  if (env.GAPWISE_AI === 'off') return undefined;
  const token = env.METERLESS_TOKEN || tokenFromRuntime(env);
  if (!token || token === 'rt-local') return undefined; // the docs' placeholder token is rejected by the runtime
  let baseUrl = (env.METERLESS_BASE_URL || 'http://127.0.0.1:8088/v1').replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
  return { baseUrl, token, model: env.METERLESS_MODEL || 'meterless/text.deep', app: env.METERLESS_APP || 'gapwise', timeoutMs: Number(env.METERLESS_TIMEOUT_MS ?? 180_000) };
}

export class MeterlessClient implements LlmClient {
  constructor(readonly cfg: MeterlessConfig, private fetchFn: typeof fetch = fetch) {}
  get requestedModel() { return this.cfg.model; }

  private headers(chat = false): Record<string, string> {
    return { authorization: `Bearer ${this.cfg.token}`, 'meterless-app': this.cfg.app, ...(chat ? { 'meterless-scope': 'user', 'content-type': 'application/json' } : {}) };
  }

  async status(): Promise<RuntimeStatus> {
    try {
      const res = await this.fetchFn(`${this.cfg.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(5_000) });
      if (res.status === 401 || res.status === 403) return { state: 'unauthorized', detail: `HTTP ${res.status}` };
      if (!res.ok) return { state: 'offline', detail: `HTTP ${res.status}` };
      const j = await res.json() as { data?: { id: string }[] };
      return { state: 'online', models: (j.data ?? []).map(m => m.id) };
    } catch (e) {
      return { state: 'offline', detail: (e as Error).message };
    }
  }

  async chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<ChatResult> {
    const res = await this.fetchFn(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST', headers: this.headers(true), signal: AbortSignal.timeout(this.cfg.timeoutMs),
      body: JSON.stringify({ model: this.cfg.model, messages, temperature: 0.1, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) }),
    });
    if (!res.ok) throw new Error(`Meterless chat: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = await res.json() as { model?: string; choices?: { message?: ChatResult['message'] }[] };
    const message = j.choices?.[0]?.message;
    if (!message) throw new Error('Meterless chat: response has no choices[0].message');
    return { message, model: j.model ?? null };
  }
}
