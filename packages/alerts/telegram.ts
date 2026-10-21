import type { Alert } from './rules';

const ICON = { info: 'ℹ️', warn: '⚠️', critical: '🚨' } as const;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Telegram HTML message, matching the ZeroGap alert design (title, details, explorer link, time). */
export function formatAlert(a: Alert, now = new Date(), dashboardUrl?: string): string {
  return [
    `${ICON[a.severity]} <b>${esc(a.title)}</b>`,
    ...a.lines.map(esc),
    ...(a.link ? [`<a href="${a.link}">View on explorer ↗</a>`] : []),
    ...(dashboardUrl ? [`<a href="${dashboardUrl}">Open dashboard</a>`] : []),
    `<i>${now.toISOString().slice(0, 16).replace('T', ' ')} UTC · ZeroGap</i>`,
  ].join('\n');
}

export type TelegramConfig = { token: string; chatId: string; dashboardUrl?: string };

export function telegramFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramConfig | undefined {
  return env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
    ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, dashboardUrl: env.PUBLIC_URL }
    : undefined;
}

export async function sendTelegram(cfg: TelegramConfig, text: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status} ${(await res.text()).slice(0, 200)}`);
}
