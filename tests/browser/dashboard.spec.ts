import { test, expect } from '@playwright/test';
test('project form, actual failed deployment logs, settings, deletion and mobile layout', async ({
  page,
  request,
}) => {
  const name = 'Browser failure check ' + Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await page.getByRole('link', { name: 'New service', exact: true }).last().click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page.getByLabel('GitHub repository URL').fill('https://gitlab.com/example/app');
  await page.getByRole('button', { name: 'Deploy Web Service', exact: true }).click();
  await expect(page.locator('.error[role=alert]')).toContainText('github.com');
  await page
    .getByLabel('GitHub repository URL')
    .fill('https://github.com/deploygrid-test-fixture/missing-' + Date.now());
  await page.getByRole('button', { name: 'Deploy Web Service', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/deployments\/[^/]+$/);
  const id = new URL(page.url()).pathname.split('/')[2];
  await expect(page.getByRole('heading', { name: 'Deployment details' })).toBeVisible();
  await expect(page.locator('.terminal pre')).toContainText('QUEUED', { timeout: 20000 });
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/projects/${id}/deployments`);
        return (await response.json())[0].status;
      },
      { timeout: 130000 },
    )
    .toBe('FAILED');
  await expect(page.locator('.error[role=alert]')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/deployment.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to project' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).last().click();
  await page.getByLabel('Health-check path').fill('/health');
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByRole('status')).toHaveText('Configuration saved.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await expect.poll(async () => (await request.get(`/api/projects/${id}`)).status()).toBe(404);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
});
