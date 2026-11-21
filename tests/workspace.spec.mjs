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
  await expect(page.getByRole('link', { name: 'New design' })).toHaveCount(5);
  const beamIcon = module => page.locator('.thumbnail[data-module="' + module + '"] i:nth-child(2)');
  const profileStyle = element => {
    const { width, height, clipPath, backgroundColor } = getComputedStyle(element);
    return { width, height, clipPath, backgroundColor };
  };
  expect(await beamIcon('steel-beam-column').evaluate(profileStyle))
    .toEqual(await beamIcon('composite-beam').evaluate(profileStyle));
  await expect(page.locator('.thumbnail[data-module="steel-beam-column"] i:first-child')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
  await expect(picker.getByRole('radio', { name: title, exact: true })).toBeChecked();
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
  await page.getByRole('searchbox', { name: 'Search modules' }).fill('not-a-module');
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
    ['Circular RC Column', 'spiral', 'Circular check in L3'],
  ]) {
    await addModule(page, search, title, name);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(shell(page).getByLabel('Design name')).toHaveValue(name, { timeout: 45000 });
    if (title === 'RC Column') {
      await expect(page.locator('#slOn')).toBeChecked();
      await page.locator('#b').fill('650');
    }
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
    const fileChooser = reopened.waitForEvent('filechooser');
    await reopened.getByRole('button', { name: 'Open Project', exact: true }).click();
    await (await fileChooser).setFiles(exported);
    await reopened.getByRole('button', { name: 'Framing', exact: true }).click();
    await reopened.getByRole('button', { name: 'L3', exact: true }).click();
    await expect(reopened.getByRole('heading', { name: 'Project ABC › Framing › L3' })).toBeVisible();
    for (const [name, value] of [[steelRenamed, 'UB'], [steelB, 'UC']]) {
      await reopened.getByRole('link', { name, exact: true }).click();
      await expect(family(reopened)).toHaveValue(value);
      await expect(shell(reopened).getByLabel('Design name')).toHaveValue(name);
      await workspace(reopened);
    }
    await reopened.waitForLoadState('load');
    await expect(reopened.getByRole('button', { name: 'Open Project', exact: true })).toBeVisible();
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

test('solves mConcreteRecCol locally and persists committed reinforcement', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('https://mbcolumnlite-api-sg.onrender.com/**', route => route.abort());
  await page.goto('t/mbcolumn-lite/?new=1');
  await expect(page).toHaveTitle('mConcreteRecCol');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  const browseBars = page.getByRole('button', { name: 'Browse longitudinal reinforcement' });
  const browseShear = page.getByRole('button', { name: 'Browse shear reinforcement' });
  const barForm = page.getByRole('dialog', { name: 'Longitudinal reinforcement' });
  const shearForm = page.getByRole('dialog', { name: 'Shear reinforcement' });
  const enable = shearForm.getByLabel('Check directional shear (EC2 2023)');
  const layout = shearForm.getByLabel('Link layout', { exact: true });
  const spacing = shearForm.getByLabel('Link spacing (mm)', { exact: true });
  const canvas = page.locator('canvas#section');
  const legend = shearForm.locator('#shear-link-legend');
  const shearCaption = page.locator('#committed-shear-summary');
  const summary = page.locator('#column-check-summary');
  expect((await summary.boundingBox()).x).toBeGreaterThan((await canvas.boundingBox()).x);
  await expect(page.locator('#b')).toHaveValue('600');
  await expect(page.locator('#h')).toHaveValue('1000');
  await expect(page.locator('#concreteGrade')).toHaveValue('C32/40');
  await expect(page.locator('#slOn')).toBeChecked();
  await expect(page.locator('#slFields')).toBeVisible();
  await expect(page.locator('#loadTable [data-k="mxb"]').first()).toBeVisible();
  await expect(page.locator('#rebarTable')).toBeHidden();
  await expect(page.getByLabel('ULS 1 Vx (kN)', { exact: true })).toHaveValue('150');
  await expect(shearCaption).toHaveText('Auto · Link Ø10 @ 150 mm · X legs: 4 · Y legs: 4');

  await browseShear.click();
  await expect(enable).toBeChecked();
  await expect(shearForm.getByLabel('Effective X legs', { exact: true })).toBeHidden();
  await layout.selectOption('manual');
  await expect(legend).toContainText('X legs: 2 · Y legs: 2');
  await expect(legend).toContainText('Outer hoop shown');
  await spacing.fill('0');
  await shearForm.getByRole('button', { name: 'Apply' }).click();
  await expect(shearForm.getByRole('status').last()).toContainText('Enter valid link spacing');
  await page.keyboard.press('Escape');
  await expect(shearForm).toBeHidden();
  await expect(browseShear).toBeFocused();
  await expect(shearCaption).toContainText('@ 150 mm');
  await browseShear.click();
  await expect(layout).toHaveValue('auto');
  await spacing.fill('125');
  await shearForm.getByRole('button', { name: 'Apply' }).click();
  await expect(shearCaption).toContainText('@ 125 mm');
  await page.getByLabel('ULS 1 Vy (kN)', { exact: true }).fill('350');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const shear = page.locator('#column-shear-results');
  await expect(shear.getByRole('heading', { name: 'Directional shear' })).toBeVisible({ timeout: 60000 });
  await expect(shear.getByRole('row').filter({ hasText: '350.0' })).toContainText('ULS 1');
  await expect(summary.getByRole('row').filter({ hasText: 'P–Mx–My interaction' })).toContainText(/\d+\.\d{3}/);
  const slenderness = summary.getByRole('row').filter({ hasText: 'Slenderness X' });
  await expect(slenderness).toContainText(/Slender|Non-slender/);
  await expect(slenderness.getByRole('cell').first()).toHaveText('');
  const overall = summary.locator('[data-overall-ur]');
  await expect(overall).toBeVisible();

  await browseBars.click();
  const firstX = barForm.getByLabel('Bar 1 X', { exact: true });
  const originalX = await firstX.inputValue();
  await firstX.fill('0');
  await barForm.getByRole('button', { name: 'Cancel' }).click();
  await expect(overall).toBeVisible();
  await browseBars.click();
  await expect(firstX).toHaveValue(originalX);
  for (const face of ['Top', 'Bottom', 'Left', 'Right']) {
    await barForm.getByLabel(face + ' face bar size', { exact: true }).selectOption('2T16');
  }
  await barForm.getByRole('button', { name: 'Replace bars', exact: true }).click();
  await barForm.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#committed-bar-summary')).toContainText('12 bundles');
  await expect(overall).toHaveCount(0);
  await browseShear.click();
  await expect(legend).toContainText('Links wrap the bundle envelope');
  await layout.selectOption('manual');
  await shearForm.getByLabel('Effective X legs', { exact: true }).fill('6');
  await shearForm.getByRole('button', { name: 'Apply' }).click();
  await expect(shearCaption).toContainText('Manual · Link Ø10 @ 125 mm · X legs: 6 · Y legs: 2');

  await page.locator('#slOn').uncheck();
  await save(page);
  await page.reload();
  await expect(page.locator('#slOn')).not.toBeChecked();
  await expect(shearCaption).toContainText('Manual · Link Ø10 @ 125 mm · X legs: 6 · Y legs: 2');
  await expect(page.locator('#committed-bar-summary')).toContainText('12 bundles');
  await expect(page.getByLabel('ULS 1 Vy (kN)', { exact: true })).toHaveValue('350');
  await browseShear.click();
  await enable.uncheck();
  await shearForm.getByRole('button', { name: 'Apply' }).click();
  await expect(shearCaption).toHaveText('Off');
  await expect(page.getByLabel('ULS 1 Vy (kN)', { exact: true })).toHaveCount(0);
  await browseShear.click();
  await enable.check();
  await expect(spacing).toHaveValue('125');
  await expect(shearForm.getByLabel('Effective X legs', { exact: true })).toHaveValue('6');
  await shearForm.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByLabel('ULS 1 Vy (kN)', { exact: true })).toHaveValue('350');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(shear.getByRole('row').filter({ hasText: '350.0' })).toContainText('ULS 1', { timeout: 60000 });
});

test('keeps the rectangular section preview compact and the editor reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('t/mbcolumn-lite/?new=1');
  const canvas = page.locator('#main-section-slot');
  const initial = await canvas.boundingBox();
  expect(initial.height).toBeLessThanOrEqual(360);
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Add load case' }).click();
  expect((await canvas.boundingBox()).height).toBe(initial.height);

  await page.setViewportSize({ width: 390, height: 844 });
  expect((await canvas.boundingBox()).height).toBeLessThan(initial.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Browse longitudinal reinforcement' }).click();
  const dialog = page.getByRole('dialog', { name: 'Longitudinal reinforcement' });
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Close longitudinal reinforcement' }).click();
  await expect(dialog).toBeHidden();
});

test('calculates, switches, and saves Circular RC Column reinforcement', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./');
  await page.getByRole('article').filter({ hasText: 'mConcreteCircCol' }).getByRole('link', { name: 'New design' }).click();
  await expect(page).toHaveTitle('mConcreteCircCol');
  const summary = page.locator('#column-check-summary');
  const section = page.locator('#circular-section');
  const calculation = page.locator('#calculation-status');
  const add = page.getByRole('button', { name: 'Add reinforcement layer' });
  const remove = page.getByRole('button', { name: 'Remove innermost reinforcement layer' });
  expect((await summary.boundingBox()).x).toBeGreaterThan((await section.boundingBox()).x);
  await expect(remove).toBeDisabled();
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  const linksMode = page.getByRole('radio', { name: 'Circular Stirrups (Closed Links)' });
  const helixMode = page.getByRole('radio', { name: 'Continuous Spiral (Helix)' });
  const elevation = page.locator('#circular-elevation');
  const pmm = summary.getByRole('row', { name: /Biaxial bending/ });
  await expect(linksMode).toBeChecked();
  await expect(elevation.locator('.elevation-link').first()).toBeVisible();
  const originalRatio = await pmm.locator('td').first().textContent();
  await expect(summary.getByRole('row', { name: /Shear Design/ })).toContainText('Not Verified');
  await helixMode.check();
  await expect(elevation.locator('.helix-front').first()).toBeVisible();
  await expect(elevation.locator('.helix-rear').first()).toBeVisible();
  await page.getByLabel('L1 Helix pitch (mm)', { exact: true }).fill('112');
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  await expect(pmm.locator('td').first()).toHaveText(originalRatio);
  await linksMode.check();
  await expect(page.getByLabel('L1 Link spacing (mm)', { exact: true })).toHaveValue('85');
  await expect(summary.getByRole('row').filter({ hasText: 'L1 bar clearance' })).toContainText('Pass');
  await expect(page.locator('#interaction-caption')).toContainText('θ = 33.7°');
  const curve = page.locator('#interaction-curve');
  const automaticGrid = await curve.evaluate(canvas => canvas.toDataURL());
  await page.getByLabel('Grid P (kN)', { exact: true }).fill('2000');
  expect(await curve.evaluate(canvas => canvas.toDataURL())).not.toBe(automaticGrid);
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#plot-axis-p')).toHaveText('P (kN)');
  await expect(page.locator('#plot-axis-m')).toHaveText('M (kNm)');
  await expect(page.locator('#plot-axis-p')).toBeVisible();
  await expect(page.locator('#plot-axis-m')).toBeVisible();
  const mobilePlot = await curve.boundingBox();
  expect(mobilePlot.x + mobilePlot.width).toBeLessThanOrEqual(375);
  await page.setViewportSize(viewport);


  await add.click();
  await add.click();
  await expect(section.locator('[data-layer]')).toHaveCount(3);
  await remove.click();
  await expect(section.locator('[data-layer]')).toHaveCount(2);
  await page.getByLabel('L2 Link spacing (mm)', { exact: true }).fill('140');
  await expect(page.locator('#section-legend')).toContainText('radial clear 48.0 mm');
  const tangent = await section.locator('[data-layer="2"]').evaluate(layer => {
    const link = layer.querySelector('.section-link');
    const bar = layer.querySelector('.section-bar');
    return +link.getAttribute('r') - +link.getAttribute('stroke-width') / 2
      - +bar.getAttribute('cx') - +bar.getAttribute('r');
  });
  expect(tangent).toBeCloseTo(0, 10);
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  await expect(pmm.locator('td').first()).not.toHaveText(originalRatio);
  await expect(summary.getByRole('row').filter({ hasText: 'L1–L2 radial clearance' })).toContainText('Pass');
  await save(page);
  await page.reload();
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  await expect(page.getByLabel('L2 Link spacing (mm)', { exact: true })).toHaveValue('140');
  await helixMode.check();
  await expect(page.getByLabel('L1 Helix pitch (mm)', { exact: true })).toHaveValue('112');
  await page.getByText('Advanced reinforcement coordinates', { exact: true }).click();
  await page.getByLabel('L2 Angular offset (°)', { exact: true }).fill('27');
  await expect(section.locator('[data-layer="2"] .section-bar').first()).not.toHaveAttribute('cy', '0');
  await shell(page).getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page).toHaveURL(/\/calc\/\?report=/, { timeout: 65000 });
});

test('moves, copies, trashes, restores, and searches folders', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  await page.getByRole('link', { name: 'Projects' }).click();
  await submitName(page, 'New Project', 'Project name', 'Folder test');
  await submitName(page, 'Add folder', 'Folder name', 'A');
  await page.getByRole('button', { name: 'Folder test', exact: true }).click();
  await submitName(page, 'Add folder', 'Folder name', 'B');

  await page.getByRole('button', { name: 'A', exact: true }).click();
  await page.getByRole('button', { name: 'Move folder', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Destination' }).selectOption({ label: 'Folder test › B' });
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Copy folder', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Destination' }).selectOption({ label: 'Project root' });
  await page.getByRole('dialog').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveCount(2);

  await page.getByRole('button', { name: 'B', exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('button', { name: 'Restore B', exact: true }).click();
  await expect(page.getByRole('button', { name: 'B', exact: true })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search this project' }).fill('a');
  await expect(page.locator('.search-results').getByRole('button', { name: 'A', exact: true })).toHaveCount(2);
});
