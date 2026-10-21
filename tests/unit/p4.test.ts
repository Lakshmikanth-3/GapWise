import { describe, it, expect } from 'vitest';
import { evaluate, dedupe, type AlertInput } from '../../packages/alerts/rules';
import { formatAlert, sendTelegram, telegramFromEnv } from '../../packages/alerts/telegram';
import { bucketOf, openItems, type SafetyEvent } from '../../packages/collectors/safety';

const clean: AlertInput = {
  assessment: { ratio: 1.00002, status: 'Balanced' }, flowMismatches: [], paused: [{ chain: 'ethereum', paused: false }],
  queued: [], actions: [], controlEvents: [], outflow1hUsd: 10, avgHourlyOutflowUsd: 10, hourBucket: 1,
};

describe('T4.2 each alert rule fires on its trigger and is silent when clean', () => {
  it('clean -> no alerts', () => expect(evaluate(clean)).toEqual([]));
  it.each<[string, Partial<AlertInput>]>([
    ['ratio_drift', { assessment: { ratio: 0.995, status: 'Drift' } }],
    ['flow_mismatch', { flowMismatches: [{ day: '2026-10-20', chain: 'cardano', matchInPct: 18, matchOutPct: 99 }] }],
    ['paused', { paused: [{ chain: 'ethereum', paused: true }] }],
    ['large_withdrawal_queued', { queued: [{ id: '0x1', amount: 500000, token: 'USDC', tx: '0xabc' }] }],
    ['timelock_action', { actions: [{ id: '0x2', kind: '3', tx: '0xdef' }] }],
    ['control_event', { controlEvents: [{ type: 'Upgraded', tx: '0x9', detail: 'new impl' }] }],
    ['outflow_spike', { outflow1hUsd: 31, avgHourlyOutflowUsd: 10 }],
  ])('%s', (rule, patch) => {
    expect(evaluate({ ...clean, ...patch }).map(x => x.rule)).toEqual([rule]);
  });
  it('Needs review and Incomplete are never alerted (ratio rules)', () => {
    expect(evaluate({ ...clean, assessment: { ratio: 1.96, status: 'Needs review' } })).toEqual([]);
    expect(evaluate({ ...clean, assessment: { ratio: 0.84, status: 'Incomplete', explainedBy: 'unpriced' } })).toEqual([]);
  });
  it('upgrades and admin withdrawals are critical', () => {
    expect(evaluate({ ...clean, controlEvents: [{ type: 'AdminWithdrawERC20', tx: '0x1', detail: '' }] })[0].severity).toBe('critical');
  });
});

describe('T4.3 de-duplication', () => {
  it('the same event twice sends one alert', () => {
    const sent = new Set<string>();
    const paused = { ...clean, paused: [{ chain: 'ethereum', paused: true }] };
    expect(dedupe(evaluate(paused), sent)).toHaveLength(1);
    expect(dedupe(evaluate(paused), sent)).toHaveLength(0);
  });
});

describe('T4.4 real alerts only (no simulation path)', () => {
  it('alerts carry no simulation tag', () => {
    const a = evaluate({ ...clean, paused: [{ chain: 'ethereum', paused: true }] })[0];
    expect(JSON.stringify(a)).not.toMatch(/SIMULATION|simulated/i);
  });
});

describe('Telegram (T4.5 format and request)', () => {
  it('formats HTML with escaped text and explorer link', () => {
    const [a] = evaluate({ ...clean, queued: [{ id: '0x1', amount: 500000, token: 'USDC', tx: '0xabc' }] });
    const t = formatAlert(a, new Date('2026-10-22T01:06:00Z'), 'https://zerogap.example');
    expect(t).toContain('<b>Large withdrawal queued</b>');
    expect(t).toContain('500,000 USDC');
    expect(t).toContain('href="https://etherscan.io/tx/0xabc"');
    expect(t).toContain('2026-10-22 01:06 UTC');
  });
  it('posts sendMessage with chat id and HTML parse mode', async () => {
    let req: { url: string; body: unknown } | undefined;
    const fake = (async (url: string, init: RequestInit) => { req = { url, body: JSON.parse(String(init.body)) }; return new Response('{"ok":true}'); }) as unknown as typeof fetch;
    await sendTelegram({ token: 'T', chatId: '-100' }, 'hi', fake);
    expect(req).toEqual({ url: 'https://api.telegram.org/botT/sendMessage', body: { chat_id: '-100', text: 'hi', parse_mode: 'HTML', disable_web_page_preview: true } });
  });
  it('is disabled without token and chat id', () => expect(telegramFromEnv({})).toBeUndefined());
});

describe('safety decoding (T4.1)', () => {
  it('rateLimitBucket sliding window (values read live on 22 Oct)', () => {
    const b = bucketOf([500000000000n, 104180476294n, 99689474060n, 1792540800n, 1000000000000n], 24, 6, 1792540800 + 86400);
    expect(b).toMatchObject({ limit: 500000, current: 104180.476294, usedPct: 20.84 });
    const mid = bucketOf([500000000000n, 0n, 100000000000n, 1792540800n, 0n], 24, 6, 1792540800 + 43200);
    expect(mid.usedPct).toBe(10);
  });
  it('tracks queued large withdrawals and timelocked actions until executed or finalized', () => {
    const ev = (type: string, block: number, args: Record<string, string>): SafetyEvent => ({ chain: 'ethereum', type, block, tx: `0x${block}`, ts: block, args });
    const open = openItems([
      ev('LargeWithdrawalQueued', 1, { requestID: 'a', amount: '1' }), ev('LargeWithdrawalQueued', 2, { requestID: 'b', amount: '1' }),
      ev('LargeWithdrawalExecuted', 3, { requestID: 'a' }), ev('ActionProposed', 4, { actionId: 'x' }),
      ev('ActionProposed', 5, { actionId: 'y' }), ev('ActionCancelled', 6, { actionId: 'y' }),
    ]);
    expect(open.queued.map(e => e.args.requestID)).toEqual(['b']);
    expect(open.actions.map(e => e.args.actionId)).toEqual(['x']);
  });
});
