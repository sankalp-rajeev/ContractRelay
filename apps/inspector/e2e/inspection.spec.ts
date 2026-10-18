import { test, expect } from '@playwright/test';

test('overview, refund inspection and persisted results work without model access', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tools evolve.');
  await page.getByRole('link', { name: 'Inspect a migration' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('refund workflow');
  const lines = page.getByLabel('Old · stable client contract', { exact: true }).locator('.codeLine');
  const firstLine = await lines.nth(0).boundingBox();
  const secondLine = await lines.nth(1).boundingBox();
  expect(secondLine!.y).toBeGreaterThan(firstLine!.y);
  await page.getByRole('link', { name: '02 Adapter', exact: true }).click();
  await expect(page.getByText('ComposeCalls', { exact: true })).toBeVisible();
  await expect(page.getByText('input.amount_dollars × 100 → integer')).toBeVisible();
  await page.getByRole('link', { name: 'Controlled benchmark' }).click();
  await expect(page.getByRole('row', { name: /B1 Deterministic/ })).toContainText('9 / 11');
  expect(errors).toEqual([]);
});

test('sqlew rejection stays visible, trial links work and unknown cases show a missing state', async ({
  page,
}) => {
  await page.goto('/real-world');
  const sqlew = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'sqlew' }) });
  await expect(sqlew).toContainText('0/3');
  await expect(sqlew).toContainText('3/3');
  await expect(sqlew).toContainText('Unsupported union type');
  await sqlew.getByRole('link', { name: 'Inspect contracts, adapter and gate' }).click();
  await page
    .getByRole('navigation', { name: 'Recorded trials' })
    .getByRole('link', { name: '3', exact: true })
    .click();
  await expect(page).toHaveURL(/trial=3/);
  await page.getByRole('link', { name: '03 Verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: '03Verification gate' })).toBeVisible();
  await expect(page.getByText('No promoted execution')).toBeVisible();
  // Next streams an HTTP 200 before a late notFound(); check the actual missing
  // state and noindex directive rather than requiring a pre-stream status code.
  await page.goto('/migrations/no-such-case');
  await expect(page.getByRole('heading', { name: 'Migration not found.' })).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('search is accessible and pages fit the viewport', async ({ page }) => {
  for (const route of [
    '/',
    '/migrations/12-refund-workflow',
    '/migrations/sqlew',
    '/real-world',
    '/benchmarks',
    '/methodology',
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  await page.goto('/migrations/12-refund-workflow');
  const search = page.getByRole('searchbox', { name: 'Find a migration' });
  await search.fill('rejected');
  await expect(
    page.getByRole('complementary', { name: 'Migration selection' }).getByRole('link'),
  ).toHaveCount(5);
  await search.fill('nothing matches');
  await expect(page.getByText('No migration matches')).toBeVisible();
});
