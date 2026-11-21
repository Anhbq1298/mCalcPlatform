import { encodeZip } from '../packages/design-sdk/src/zip.mjs';
import { expect, test } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';

const cases = [
  ['calc/', 'Worksheet check'],
  ['t/steel-beam-column/', 'Steel beam-column check'],
  ['t/composite-beam/', 'Composite check'],
  ['t/mbcolumn-lite/', 'Concrete check'],
];

test('opens, saves and reopens each integrated tool under a Pages project path', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Tool Library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New design' })).toHaveCount(4);
  for (const [route, name] of cases) {
    await page.goto(route + '?new=1');
    const shell = page.getByRole('navigation', { name: 'Design workspace' });
    await shell.getByLabel('Design name').fill(name, { timeout: 45000 });
    if (route.includes('mbcolumn-lite')) await page.locator('#b').fill('700');
    if (route.includes('steel-beam-column')) await page.getByLabel('Family', { exact: true }).selectOption('UB');
    await shell.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(shell.getByText('Design saved.')).toBeVisible();
    await expect(page).toHaveURL(/\?design=[a-z0-9-]+$/);
    await page.reload();
    await expect(shell.getByLabel('Design name')).toHaveValue(name, { timeout: 45000 });
    await expect(shell.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    if (route.includes('mbcolumn-lite')) await expect(page.locator('#b')).toHaveValue('700');
    if (route.includes('steel-beam-column')) await expect(page.getByLabel('Family', { exact: true })).toHaveValue('UB');
    await expect(shell.getByText(/unavailable|invalid|did not/i)).toHaveCount(0);
  }

  await page.goto('./');
  await page.getByRole('link', { name: 'Projects' }).click();
  const designs = page.locator('#design-list');
  for (const [, name] of cases) await expect(designs.getByRole('link', { name, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByLabel('Project name').fill('Demo project');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Saved designs', exact: true }).click();
  const worksheet = designs.locator('.saved').filter({ hasText: 'Worksheet check' });
  await worksheet.getByRole('button', { name: 'Add to project' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const project = page.locator('#projects');
  await expect(project.getByRole('link', { name: 'Worksheet check' })).toBeVisible();
  await project.getByRole('link', { name: 'Print calc package' }).click();
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled({ timeout: 65000 });
});

const steelA = 'Diagrid Link Beam – Option A';
const steelB = 'Diagrid Link Beam – Option B';
const steelRenamed = 'Diagrid Link Beam – Governing';
const shell = page => page.getByRole('navigation', { name: 'Design workspace' });
const family = page => page.getByLabel('Family', { exact: true });
const workspace = page => shell(page).getByRole('link', { name: 'Workspace' }).click();
const save = async page => {
  await shell(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(shell(page).getByText('Design saved.', { exact: true })).toBeVisible();
};

async function submitName(page, action, label, name) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(label, { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

async function addModule(page, filter, title, name) {
  await page.getByRole('button', { name: '+ Add design module', exact: true }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByText('Project ABC › Framing › L3', { exact: true })).toBeVisible();
  const search = picker.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.fill(filter);
  await picker.getByRole('heading', { name: title, exact: true }).click();
  await expect(picker.getByRole('radio', { name: title })).toBeChecked();
  const field = picker.getByLabel('Design name', { exact: true });
  await expect(field).toHaveValue(title);
  await field.fill(name);
  await picker.getByRole('button', { name: 'Add design', exact: true }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
}

test('saves independent calculations in nested folders and reopens the file in fresh storage', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(240000);
  await page.goto('./');
  await page.getByRole('link', { name: 'Projects' }).click();
  await submitName(page, 'New Project', 'Project name', 'Project ABC');
  await submitName(page, 'Add folder', 'Folder name', 'Framing');
  await submitName(page, 'Add subfolder', 'Folder name', 'Level 3');
  await submitName(page, 'Rename folder', 'Folder name', 'L3');
  await page.getByRole('button', { name: 'Collapse Framing' }).click();
  await expect(page.getByRole('button', { name: 'L3', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand Framing' }).click();

  await page.getByRole('button', { name: '+ Add design module', exact: true }).click();
  await page.getByRole('searchbox').fill('not-a-module');
  await expect(page.getByText('No modules found')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await addModule(page, 'EC3', 'Steel Beam-Column', steelA);
  await addModule(page, 'ec3', 'Steel Beam-Column', steelB);
  for (const [name, value] of [[steelA, 'UB'], [steelB, 'UC']]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(shell(page).getByLabel('Design name')).toHaveValue(name);
    await family(page).selectOption(value);
    await save(page);
    await workspace(page);
  }
  await submitName(page, 'Rename ' + steelA, 'Calculation name', steelRenamed);

  for (const [title, search, name] of [
    ['Calculation Worksheet', 'mCalcCanvas', 'Design worksheet'],
    ['Composite Beam', 'serviceability', 'Composite check in L3'],
    ['RC Column', 'EC2', 'Column check in L3'],
  ]) {
    await addModule(page, search, title, name);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(shell(page).getByLabel('Design name')).toHaveValue(name, { timeout: 45000 });
    if (title === 'RC Column') await page.locator('#b').fill('650');
    await save(page);
    await workspace(page);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(shell(page).getByLabel('Design name')).toHaveValue(name);
    await expect(shell(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    if (title === 'RC Column') await expect(page.locator('#b')).toHaveValue('650');
    await workspace(page);
  }

  await page.getByRole('link', { name: steelRenamed, exact: true }).click();
  await expect(family(page)).toHaveValue('UB');
  await workspace(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Project', exact: true }).click();
  const download = await downloadPromise;
  const exported = info.outputPath('Project ABC.mcalc');
  await download.saveAs(exported);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Project ABC › Framing › L3' })).toBeVisible();

  const fresh = await browser.newContext({ baseURL });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('./#projects');
    await reopened.locator('#import').setInputFiles(exported);
    await reopened.getByRole('button', { name: 'Framing', exact: true }).click();
    await reopened.getByRole('button', { name: 'L3', exact: true }).click();
    await expect(reopened.getByRole('heading', { name: 'Project ABC › Framing › L3' })).toBeVisible();
    for (const [name, value] of [[steelRenamed, 'UB'], [steelB, 'UC']]) {
      await reopened.getByRole('link', { name, exact: true }).click();
      await expect(family(reopened)).toHaveValue(value);
      await expect(shell(reopened).getByLabel('Design name')).toHaveValue(name);
      await workspace(reopened);
    }
    await reopened.locator('#import').setInputFiles({ name: 'invalid.mcalc', mimeType: 'application/zip', buffer: Buffer.from('bad file') });
    await expect(reopened.locator('#status')).toContainText('Invalid package');
    await expect(reopened.getByRole('link', { name: steelRenamed, exact: true })).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('opens the original flat project format and preserves unavailable calculations', async ({ page }) => {
  const project = { id: 'legacy', name: 'Existing export', settings: {}, folders: [{ id: 'beams', name: 'Beams', designs: ['older'] }] };
  const items = [{ id: 'older', tool: 'removed-tool', toolVersion: '1', schema: 1, meta: { name: 'Older check', mark: '', label: '', notes: '' } }];
  const json = value => new TextEncoder().encode(JSON.stringify(value));
  const zip = encodeZip(new Map([
    ['manifest.json', json({ format: 'mcalc', version: 1, project, items })],
    ['items/older/inputs.json', json({ laterField: { retained: true } })],
  ]));
  await page.goto('./#projects');
  await page.locator('#import').setInputFiles({ name: 'legacy.mcalc', mimeType: 'application/zip', buffer: Buffer.from(await zip.arrayBuffer()) });
  await page.getByRole('button', { name: 'Beams', exact: true }).click();
  const card = page.getByRole('article').filter({ hasText: 'Older check' });
  await expect(card.getByText('Module unavailable')).toBeVisible();
});
