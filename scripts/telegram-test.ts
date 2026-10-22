// Sends one test message through the real alert path (formatAlert + sendTelegram) to verify Telegram delivery (T4.5).
import 'dotenv/config';
import { formatAlert, sendTelegram, telegramFromEnv } from '../packages/alerts/telegram';

const cfg = telegramFromEnv();
if (!cfg) throw new Error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
const t0 = Date.now();
await sendTelegram(cfg, formatAlert({
  rule: 'delivery_test', severity: 'info', key: `test:${t0}`, title: 'ZeroGap alerts connected',
  lines: ['This channel will receive real Strike Finance safety alerts: pauses, queued large withdrawals, timelocked changes, upgrades, admin withdrawals, flow mismatches and ratio drift.', 'Test message — not an alert.'],
}, new Date(), cfg.dashboardUrl));
console.log(`delivered in ${Date.now() - t0} ms`);
