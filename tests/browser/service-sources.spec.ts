import { test, expect } from '@playwright/test';
test('creates and publishes a static SPA using real build variables, correct service labels and live routes', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/projects/new');
  await page.getByLabel('Source', { exact: true }).selectOption('IMAGE');
  await page.getByLabel('Public image reference').fill('invalid image reference');
  await page.getByLabel('Service type', { exact: true }).selectOption('STATIC');
  await expect(page.getByRole('heading', { name: 'Create a static site' })).toBeVisible();
  await page.getByLabel('Project name', { exact: true }).fill('Static documentation');
  await page.getByLabel('GitHub repository URL').fill('https://github.com/deploygrid/fixture');
  await page.getByLabel('Root directory').fill('site');
  await page.getByLabel('Build command', { exact: false }).fill('node build.mjs');
  await page.getByLabel('Rewrite SPA routes to index.html').check();
  await page.getByRole('button', { name: 'Add environment variable', exact: true }).click();
  await page.getByLabel('Variable key 1', { exact: true }).fill('PUBLIC_TITLE');
  await page
    .getByLabel('Variable value 1', { exact: true })
    .fill('Published from the static browser build');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/phase2-static-create.png', fullPage: true });
  await page.getByRole('button', { name: 'Deploy Static Site', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/deployments\/[^/]+$/);
  const [id, deploymentId] = [
    new URL(page.url()).pathname.split('/')[2],
    new URL(page.url()).pathname.split('/')[4],
  ];
  await expect
    .poll(
      async () => (await (await request.get(`/api/deployments/${deploymentId}`)).json()).status,
      { timeout: 90000 },
    )
    .toBe('SUCCEEDED');
  await expect(page.locator('.terminal pre')).toContainText('Your service is live');
  await page.getByRole('link', { name: 'Back to project' }).click();
  await expect(page.locator('.service-type')).toContainText('STATIC SITE');
  const p = await (await request.get(`/api/projects/${id}`)).json();
  const app = await context.newPage();
  await app.goto(p.applicationUrl + '/dashboard/settings');
  await expect(app.getByRole('heading')).toHaveText('Published from the static browser build');
  await app.screenshot({ path: 'docs/screenshots/phase2-static-live.png', fullPage: true });
  await app.close();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Filter services by type' }).selectOption('STATIC');
  await expect(page.locator('.service-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.service-table tbody')).toContainText('Static site');
  await page.goto(`/projects/${id}?tab=settings`);
  await expect(page.getByLabel('Publish directory')).toHaveValue('dist');
  await expect(page.getByLabel('Rewrite SPA routes to index.html')).toBeChecked();
  expect(errors).toEqual([]);
});
