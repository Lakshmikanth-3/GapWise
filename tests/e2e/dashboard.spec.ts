import { test, expect } from '@playwright/test';

test('T3.4 home loads under 2 s with all three chains and correct explorer links', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(page.locator('#chains')).toContainText('Ethereum', { timeout: 15_000 });
  await expect(page.locator('#chains')).toContainText('Solana');
  await expect(page.locator('#chains')).toContainText('Cardano');
  await expect(page.locator('#chains a[href*="etherscan.io/address/0xbF4cFccd11257e568A936a7867D138f54A43cffa"]')).toHaveCount(1);
  await expect(page.locator('#chains a[href*="solscan.io/account/Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt"]')).toHaveCount(1);
  await expect(page.locator('#chains a[href*="cardanoscan.io/address/"]')).toHaveCount(2);
});

test('T3.1 ratio card shows status, value and timestamp from live state', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('#status')).toHaveText(/Balanced|Drift|Incomplete|Needs review/, { timeout: 15_000 });
  await expect(page.locator('#ratio-src')).toContainText('Liability scan');
  await expect(page.locator('#scan-meta')).toContainText('Last scan');
});

test('T3.3 an API outage keeps the last render and flags it', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('#res-usd')).toHaveText(/\$/, { timeout: 15_000 });
  const before = await page.locator('#res-usd').textContent();
  await page.route('**/api/state', r => r.abort());
  await page.evaluate(() => new Promise(r => setTimeout(r, 16_000)));
  await expect(page.locator('body')).toHaveClass(/offline/);
  await expect(page.locator('#res-usd')).toHaveText(before!);
});

for (const path of ['/', '/dashboard', '/my-safety']) {
  test(`T3.5 mobile width 375 px has no horizontal scroll: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await page.waitForTimeout(3000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('T3.2 a snapshot older than 10 minutes shows a stale warning banner', async ({ page }) => {
  await page.route('**/api/state', async route => {
    const res = await route.fetch();
    const body = await res.json();
    const old = Date.now() - 25 * 60_000;
    body.now = old; if (body.ratio) body.ratio.ts = old;
    await route.fulfill({ json: body });
  });
  await page.goto('/dashboard');
  await expect(page.locator('#stale-banner')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#stale-banner')).toContainText('Stale data');
});

test('testnet view is clearly labelled and uses testnet data', async ({ page }) => {
  await page.goto('/dashboard?network=testnet');
  await expect(page.locator('#testnet-banner')).toBeVisible();
  await expect(page.locator('#testnet-banner')).toContainText('Test funds, not real money');
  await expect(page.locator('#net-testnet')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#dl-report-link')).toHaveAttribute('href', /network=testnet/);
});

test('mainnet is the default view, with no testnet banner', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('#testnet-banner')).toBeHidden();
  await expect(page.locator('#net-mainnet')).toHaveAttribute('aria-current', 'page');
});
