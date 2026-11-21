import { expect, test } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';

const cases = [
  ['calc/', 'Worksheet check'],
  ['t/steel-beam-column/', 'Steel beam-column check'],
  ['t/composite-beam/', 'Composite check'],
  ['t/mbcolumn-lite/', 'Concrete check'],
];

test('opens, saves and reopens each integrated tool under a Pages project path', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Structural design workspace' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New design' })).toHaveCount(4);
  for (const [route, name] of cases) {
    await page.goto(route + '?new=1');
    const shell = page.getByRole('navigation', { name: 'Design workspace' });
    await shell.getByLabel('Design name').fill(name, { timeout: 45000 });
    await shell.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(shell.getByText('Design saved.')).toBeVisible();
    await expect(page).toHaveURL(/\?design=[a-z0-9-]+$/);
    await page.reload();
    await expect(shell.getByLabel('Design name')).toHaveValue(name, { timeout: 45000 });
    await expect(shell.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(shell.getByText(/unavailable|invalid|did not/i)).toHaveCount(0);
  }

  await page.goto('./');
  const designs = page.locator('#designs');
  for (const [, name] of cases) await expect(designs.getByRole('link', { name, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Demo project');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const worksheet = designs.locator('.saved').filter({ hasText: 'Worksheet check' });
  await worksheet.getByRole('button', { name: 'Add to project' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const project = page.locator('#projects');
  await expect(project.getByRole('link', { name: 'Worksheet check' })).toBeVisible();
  await project.getByRole('link', { name: 'Print calc package' }).click();
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled({ timeout: 65000 });
});
