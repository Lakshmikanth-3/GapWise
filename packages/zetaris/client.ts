// Zetaris data layer: GapWise publishes each scan as SQL tables and the Gap Investigator queries them.
// API surface follows Zetaris' own helper (github.com/zetaris/getting-started scripts/zetaris_api.ts, query_zetaris.ts):
//   POST {ZETARIS_BASE_URL}/api/auth/login {username,password} → idToken   (or ZETARIS_API_KEY as the bearer token)
//   POST {ZETARIS_BASE_URL}/api/proxy/sql-editor/sqls/run-query {sql, limit, engineId?}
//   headers: Authorization: Bearer <token>, X-Org-ID, X-Request-ID (fresh UUID); 30 s timeout.
// The response body shape of run-query is not documented in text, so rows are normalized defensively and anything
// unrecognised is an error (never an empty success).
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';

export type ZetarisConfig = {
  baseUrl: string; orgId: string; apiKey?: string; username?: string; password?: string;
  engineId?: string; limit: number;
  /** Namespace the GapWise tables live in (a schema or data source registered in Zetaris), e.g. "gapwise". */
  schema: string;
};

export function zetarisFromEnv(env: NodeJS.ProcessEnv = process.env): ZetarisConfig | undefined {
  const baseUrl = env.ZETARIS_BASE_URL?.replace(/\/$/, '');
  const orgId = env.ZETARIS_ORG_ID;
  if (!baseUrl || !orgId) return undefined;
  if (!/^https?:\/\/[^/]+$/.test(baseUrl)) throw new Error('ZETARIS_BASE_URL must be an HTTP(S) origin without a path');
  if (!/^\d+$/.test(orgId)) throw new Error('ZETARIS_ORG_ID must be the numeric organization ID');
  if (!env.ZETARIS_API_KEY && !(env.ZETARIS_USERNAME && env.ZETARIS_PASSWORD)) return undefined;
  const schema = env.ZETARIS_SCHEMA || 'gapwise';
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(schema)) throw new Error('ZETARIS_SCHEMA must be a plain identifier');
  return {
    baseUrl, orgId, apiKey: env.ZETARIS_API_KEY || undefined, username: env.ZETARIS_USERNAME, password: env.ZETARIS_PASSWORD,
    engineId: env.ZETARIS_ENGINE_ID || undefined, limit: Math.min(Number(env.ZETARIS_QUERY_LIMIT ?? 1000) || 1000, 5000), schema,
  };
}

export type QueryLog = { at: string; sql: string; ms: number; rows?: number; error?: string };
export type SqlResult = { rows: Record<string, unknown>[]; ms: number; sql: string };

const TIMEOUT_MS = 30_000;

export class ZetarisClient {
  private token?: string;
  readonly log: QueryLog[] = [];
  constructor(readonly cfg: ZetarisConfig, private fetchFn: typeof fetch = fetch, private logFile = process.env.ZETARIS_QUERY_LOG ?? 'data/zetaris-queries.jsonl') {}

  private async login(): Promise<string> {
    if (this.cfg.apiKey) return this.cfg.apiKey;
    if (this.token) return this.token;
    const res = await this.fetchFn(`${this.cfg.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
      body: JSON.stringify({ username: this.cfg.username, password: this.cfg.password }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Zetaris login failed: HTTP ${res.status}`);
    const j = await res.json() as Record<string, unknown>;
    const t = j.idToken ?? j.token ?? j.accessToken;
    if (typeof t !== 'string' || !t) throw new Error('Zetaris login did not return an access token');
    return (this.token = t);
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    const token = await this.login();
    const res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'x-org-id': this.cfg.orgId, 'x-request-id': randomUUID(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Zetaris ${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }

  /** Availability check used by /api/why status: lists visible Lightning databases (no SQL is run). */
  async ping(): Promise<{ ok: true; databases: number }> {
    const dbs = await this.request('/api/proxy/lightning-database/databases', 'GET');
    if (!Array.isArray(dbs)) throw new Error('unexpected database-list response');
    return { ok: true, databases: dbs.length };
  }

  /** Internal, trusted SQL (publishing). The agent never calls this directly: it goes through `runSql`. */
  async exec(sql: string): Promise<SqlResult> {
    const t0 = Date.now();
    const entry: QueryLog = { at: new Date().toISOString(), sql, ms: 0 };
    try {
      const body = await this.request('/api/proxy/sql-editor/sqls/run-query', 'POST', { sql, limit: this.cfg.limit, ...(this.cfg.engineId ? { engineId: this.cfg.engineId } : {}) });
      const rows = normalizeRows(body);
      Object.assign(entry, { ms: Date.now() - t0, rows: rows.length });
      return { rows, ms: entry.ms, sql };
    } catch (e) {
      Object.assign(entry, { ms: Date.now() - t0, error: (e as Error).message });
      throw e;
    } finally {
      this.log.push(entry);
      console.log(`[zetaris] ${entry.ms}ms ${entry.error ? 'ERR ' + entry.error : `${entry.rows} rows`} · ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
      await mkdir('data', { recursive: true }).then(() => appendFile(this.logFile, JSON.stringify(entry) + '\n')).catch(() => {});
    }
  }

  /** The agent's SQL tool: read-only, single statement, GapWise tables only, bounded rows. */
  runSql(sql: string): Promise<SqlResult> {
    return this.exec(guardSql(sql, this.cfg.schema, Math.min(this.cfg.limit, 500)));
  }
}

/** Accepts the response shapes a SQL-over-HTTP endpoint commonly returns; anything else is an error. */
export function normalizeRows(body: unknown): Record<string, unknown>[] {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(body)) {
    if (body.every(obj)) return body as Record<string, unknown>[];
    throw new Error('Zetaris: array response without row objects');
  }
  if (!obj(body)) throw new Error('Zetaris: empty or non-JSON response');
  for (const k of ['rows', 'data', 'records', 'results', 'result']) {
    const v = body[k];
    if (Array.isArray(v)) {
      if (v.every(obj)) return v as Record<string, unknown>[];
      const cols = (body.columns ?? body.columnNames ?? body.header) as unknown;
      if (Array.isArray(cols) && v.every(Array.isArray)) {
        const names = cols.map(c => (obj(c) ? String(c.name ?? c.label ?? '') : String(c)));
        return (v as unknown[][]).map(r => Object.fromEntries(names.map((n, i) => [n, r[i]])));
      }
    }
    if (obj(v)) return normalizeRows(v);
  }
  throw new Error(`Zetaris: unrecognised response shape (keys: ${Object.keys(body).join(', ').slice(0, 120)})`);
}

export const GAPWISE_TABLES = ['scans', 'reserves', 'liabilities', 'prices', 'flows', 'safety_events'] as const;
const FORBIDDEN = /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|exec|execute|copy|set|use|attach|load|refresh|cache|uncache|msck|analyze)\b/i;

/**
 * Model-supplied SQL is untrusted. Allowed: one SELECT/WITH statement over the GapWise tables, no comments, no DDL/DML.
 * Every FROM/JOIN target must be `<schema>.<gapwise table>` or a CTE defined in the same statement. A LIMIT is enforced.
 */
export function guardSql(sql: string, schema: string, maxRows = 500): string {
  const s = sql.trim().replace(/;\s*$/, '');
  if (!s) throw new Error('SQL rejected: empty');
  if (s.length > 4000) throw new Error('SQL rejected: longer than 4000 characters');
  if (/;|--|\/\*/.test(s)) throw new Error('SQL rejected: one statement, no comments');
  if (!/^(select|with)\b/i.test(s)) throw new Error('SQL rejected: only SELECT / WITH queries are allowed');
  const noStrings = s.replace(/'(?:[^']|'')*'/g, "''");
  if (FORBIDDEN.test(noStrings)) throw new Error(`SQL rejected: forbidden keyword ${noStrings.match(FORBIDDEN)![0]}`);
  const ctes = new Set([...noStrings.matchAll(/(?:\bwith|,)\s*([A-Za-z_]\w*)\s+as\s*\(/gi)].map(m => m[1].toLowerCase()));
  const allowed = new Set(GAPWISE_TABLES.map(t => `${schema}.${t}`.toLowerCase()));
  for (const m of noStrings.matchAll(/\b(?:from|join)\s+([A-Za-z_][\w.]*|\()/gi)) {
    const t = m[1].toLowerCase();
    if (t === '(' || ctes.has(t) || allowed.has(t)) continue;
    throw new Error(`SQL rejected: table ${m[1]} is not a GapWise table (allowed: ${[...allowed].join(', ')})`);
  }
  const lim = noStrings.match(/\blimit\s+(\d+)\s*$/i);
  if (lim) return Number(lim[1]) <= maxRows ? s : s.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${maxRows}`);
  return `${s} LIMIT ${maxRows}`;
}
