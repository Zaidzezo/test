import { test, expect } from '@playwright/test';
test('deploys real fixture, configures secrets, rolls back, monitors health and keeps the gateway URL', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(240000);
  const name = 'Atlas API';
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'New service', exact: true }).last().click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page.getByLabel('GitHub repository URL').fill('https://github.com/deploygrid/fixture');
  await page.getByLabel('Health-check path').fill('/health');
  await page.getByRole('button', { name: 'Add environment variable', exact: true }).click();
  await page.getByLabel('Variable key 1', { exact: true }).fill('GREETING');
  await page.getByLabel('Variable value 1', { exact: true }).fill('hello-first-release');
  await page.getByRole('button', { name: 'Deploy Web Service', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/deployments\/[^/]+$/);
  const id = new URL(page.url()).pathname.split('/')[2];
  async function tab(label: string) {
    await page.getByRole('link', { name: label, exact: true }).last().click();
  }
  await expect(page.getByRole('heading', { name: 'Deployment details' })).toBeVisible();
  await expect(page.locator('.terminal pre')).toContainText('QUEUED', { timeout: 15000 });
  async function waitDeployment() {
    await expect(page).toHaveURL(/\/deployments\/[^/]+$/);
    const deploymentId = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect
      .poll(
        async () => {
          const d = await (await request.get(`/api/deployments/${deploymentId}`)).json();
          return ['SUCCEEDED', 'FAILED'].includes(d.status) ? d.status : 'pending';
        },
        { timeout: 90000, intervals: [1000] },
      )
      .not.toBe('pending');
    const d = await (await request.get(`/api/deployments/${deploymentId}`)).json();
    expect(d.status, d.errorMessage ?? '').toBe('SUCCEEDED');
  }
  await waitDeployment();
  await page.getByRole('searchbox', { name: 'Search logs' }).fill('Your service is live');
  await expect(page.locator('.terminal pre')).toContainText('Your service is live');
  await expect(page.locator('.terminal pre')).not.toContainText('Cloning from');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download logs', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('deploygrid-logs.txt');
  await page.getByRole('searchbox', { name: 'Search logs' }).fill('');
  await page.getByRole('link', { name: 'Back to project' }).click();
  let p = await (await request.get(`/api/projects/${id}`)).json();
  const stable = p.applicationUrl;
  const host = new URL(stable).hostname;
  async function appBody() {
    const response = await request.get('http://127.0.0.1:8080/', { headers: { host } });
    return response.json();
  }
  expect((await appBody()).message).toBe('hello-first-release');
  await expect(page.locator('.service-heading .badge')).toHaveText('running');
  await tab('Environment');
  await page.getByRole('button', { name: 'Replace GREETING' }).click();
  await page.getByLabel('Value', { exact: true }).fill('hello-second-release');
  await page.getByLabel('Apply changes').selectOption('deploy');
  await page.getByRole('button', { name: 'Save variable', exact: true }).click();
  await waitDeployment();
  await page.getByRole('link', { name: 'Back to project' }).click();
  expect((await appBody()).message).toBe('hello-second-release');
  await tab('Deployments');
  await page
    .getByRole('button', { name: /Rollback to/ })
    .first()
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm rollback', exact: true }).click();
  await waitDeployment();
  await page.getByRole('link', { name: 'Back to project' }).click();
  expect((await appBody()).message).toBe('hello-first-release');
  p = await (await request.get(`/api/projects/${id}`)).json();
  expect(p.applicationUrl).toBe(stable);
  expect(p.currentDeployment.kind).toBe('ROLLBACK');
  await expect
    .poll(
      async () => (await (await request.get(`/api/projects/${id}/health-checks`)).json()).length,
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await tab('Application logs');
  await expect(page.locator('.terminal pre')).toContainText('Example listening on');
  await tab('Health checks');
  await expect(page.locator('.health-strip .healthy').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/v2-health.png', fullPage: true });
  await tab('Networking');
  await expect(page.locator('.networking-card').first()).toContainText(stable);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enable public sharing', exact: true }).click();
  await expect(page.locator('.error')).toContainText('cloudflared is not installed', {
    timeout: 15000,
  });
  await page.screenshot({ path: 'docs/screenshots/v2-networking.png', fullPage: true });
  await tab('Overview');
  await page.getByRole('button', { name: 'stop', exact: true }).click();
  await expect(page.locator('.service-heading .badge')).toHaveText('stopped', { timeout: 15000 });
  await page.getByRole('button', { name: 'start', exact: true }).click();
  await expect(page.locator('.service-heading .badge')).toHaveText('running', { timeout: 15000 });
  expect((await appBody()).message).toBe('hello-first-release');
  await page.waitForTimeout(5500);
  await page.screenshot({ path: 'docs/screenshots/v2-service.png', fullPage: true });
  const external = context.waitForEvent('page');
  await page.locator('.service-url-row>a').click();
  const application = await external;
  await expect(application.locator('body')).toContainText('hello-first-release');
  await application.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/v2-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'All services', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Search services' }).fill(name);
  await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/v2-workspace.png', fullPage: true });
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByText('Environment updated', { exact: true }).first()).toBeVisible();
  expect(browserErrors).toEqual([]);
});
