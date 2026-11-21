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
  await expect(page.getByRole('link', { name: 'New design' })).toHaveCount(6);
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
    ['Circular RC Column', 'spiral', 'Circular check in L3'],
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

test('solves mConcreteRecCol locally and restores shear inputs by design ID', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('https://mbcolumnlite-api-sg.onrender.com/**', route => route.abort());
  await page.goto('t/mbcolumn-lite/?new=1');
  await expect(page).toHaveTitle('mConcreteRecCol');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  const enable = page.getByLabel('Check directional shear (EC2 2023)');
  const canvas = page.locator('canvas#section');
  const legend = page.locator('#shear-link-legend');
  const summary = page.locator('#column-check-summary');
  const sectionBox = await canvas.boundingBox();
  expect((await summary.boundingBox()).x).toBeGreaterThan(sectionBox.x);
  await expect(page.locator('#b')).toHaveValue('600');
  await expect(page.locator('#h')).toHaveValue('1000');
  await expect(page.locator('#concreteGrade')).toHaveValue('C32/40');
  await expect(page.locator('#fc')).toHaveValue('32');
  await expect(enable).toBeChecked();
  await expect(page.getByLabel('ULS 1 Vx (kN)', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('ULS 1 Vy (kN)', { exact: true })).toHaveValue('250');
  await expect(legend).toContainText('Auto · Link Ø10 @ 150 mm · X legs: 4 · Y legs: 4');
  await expect(page.getByLabel('Effective X legs', { exact: true })).toBeHidden();
  const generatedLinks = await canvas.evaluate(element => element.toDataURL());
  await page.getByLabel('Link layout', { exact: true }).selectOption('manual');
  await expect(legend).toContainText('X legs: 2 · Y legs: 2');
  expect(await canvas.evaluate(element => element.toDataURL())).not.toBe(generatedLinks);
  await page.getByLabel('Link layout', { exact: true }).selectOption('auto');
  await page.getByLabel('Link spacing (mm)', { exact: true }).fill('125');
  await page.getByLabel('ULS 1 Vy (kN)', { exact: true }).fill('350');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const shear = page.locator('#column-shear-results');
  await expect(shear.getByRole('heading', { name: 'Directional shear' })).toBeVisible({ timeout: 60000 });
  await expect(shear.getByRole('row').filter({ hasText: '350.0' })).toContainText('ULS 1');
  await expect(summary.getByRole('row').filter({ hasText: 'P–Mx–My interaction' })).toContainText(/\d+\.\d{3}/);
  await expect(summary.getByRole('row').filter({ hasText: 'Shear Y' })).toContainText('ULS 1');
  await expect(summary.getByRole('row').filter({ hasText: 'Slenderness X' })).toContainText('Off');
  await expect(summary.locator('[data-overall-ur]')).toBeVisible();
  await expect(legend).toContainText('@ 125 mm');
  await save(page);
  await page.reload();
  await expect(enable).toBeChecked();
  await expect(summary.locator('[data-overall-ur]')).toHaveCount(0);
  await expect(legend).toContainText('X legs: 4 · Y legs: 4');
  await expect(page.getByLabel('Link spacing (mm)', { exact: true })).toHaveValue('125');
  await expect(page.getByLabel('ULS 1 Vy (kN)', { exact: true })).toHaveValue('350');

  for (const face of ['Top', 'Bottom', 'Left', 'Right']) {
    await page.getByLabel(face + ' face bar size', { exact: true }).selectOption('2T16');
  }
  await page.getByRole('button', { name: 'Replace bars', exact: true }).click();
  await expect(legend).toContainText('X legs: 4 · Y legs: 4 · Bundled bars');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(shear.getByRole('row').filter({ hasText: '350.0' })).toContainText('ULS 1', { timeout: 60000 });
});

test('calculates and saves a Circular RC Column using the reference worksheet', async ({ page }) => {
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
  await expect(summary).toContainText('0.769');
  await expect(summary.locator('[data-overall-ur]')).toHaveText('0.872');
  await expect(summary.getByRole('row').filter({ hasText: 'L1 bar clearance' })).toContainText('Pass');
  await expect(page.locator('#checks')).toContainText('1022.4 mm');
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
  await expect(page.locator('#section-legend')).toContainText('radial clear 32.0 mm');
  const tangent = await section.locator('[data-layer="2"]').evaluate(layer => {
    const link = layer.querySelector('.section-link');
    const bar = layer.querySelector('.section-bar');
    return +link.getAttribute('r') - +link.getAttribute('stroke-width') / 2
      - +bar.getAttribute('cx') - +bar.getAttribute('r');
  });
  expect(tangent).toBeCloseTo(0, 10);
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  await expect(summary).not.toContainText('0.769');
  await expect(summary.getByRole('row').filter({ hasText: 'L1–L2 radial clearance' })).toContainText('Pass');
  await save(page);
  await page.reload();
  await expect(calculation).toHaveText('Calculation complete.', { timeout: 65000 });
  await expect(page.getByLabel('L2 Link spacing (mm)', { exact: true })).toHaveValue('140');
  await shell(page).getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page).toHaveURL(/\/calc\/\?report=/, { timeout: 65000 });
});

test('designs punching shear links, edits a provided layout, saves, reopens and reports', async ({ page }) => {
  await page.goto('./');
  await page.locator('a[href*="t/punching-shear/"]').filter({ hasText: 'New design' }).first().click();
  await expect(page.getByRole('heading', { name: /mPunchingShear/ })).toBeVisible();
  const status = page.locator('#design-status');
  await expect(status).toContainText('Incomplete input');
  await page.getByLabel('Braced, spans differ ≤ 25 % (§6.4.3(6))').check();
  await page.getByLabel('1 V_Ed', { exact: true }).fill('800');
  await expect(status).toContainText('Requires confirmation');
  await page.getByLabel('Links enclose top and bottom flexural bars').check();
  await expect(status).toContainText('Design status: Pass');
  await page.getByLabel('Column position').selectOption('edge');
  await expect(status).toContainText('Incomplete input');
  await expect(page.locator('#messages')).toContainText('geometry is an internal column');
  await page.getByLabel('Column position').selectOption('internal');
  const schedule = page.locator('#layer-schedule tbody tr');
  await expect(schedule).toHaveCount(4);
  await expect(page.locator('#plan-view [data-link]')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Edit auto layout' }).click();
  await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('provided');
  await page.getByRole('button', { name: 'Link layers: add row' }).click();
  await expect(schedule).toHaveCount(5);
  await page.locator('#plan-view [data-link="L2-3"]').click();
  await expect(page.locator('#selection-info')).toContainText('L2-3');
  await page.getByRole('button', { name: 'Omit selected link' }).click();
  await expect(page.locator('#plan-view [data-link="L2-3"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load combinations: add row' }).click();
  await page.getByLabel('2 M_y', { exact: true }).fill('60');
  await page.getByLabel('2 V_Ed', { exact: true }).fill('500');
  await expect(page.locator('#combination option')).toHaveCount(2);
  const shell = page.getByRole('navigation', { name: 'Design workspace' });
  await shell.getByLabel('Design name').fill('PS-01 internal column');
  await shell.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(shell.getByText('Design saved.')).toBeVisible();
  const before = await status.textContent();
  await page.reload();
  await expect(shell.getByLabel('Design name')).toHaveValue('PS-01 internal column', { timeout: 45000 });
  await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('provided');
  await expect(schedule).toHaveCount(5);
  await expect(page.locator('#plan-view [data-link="L2-3"]')).toHaveCount(0);
  await expect(page.getByLabel('2 M_y', { exact: true })).toHaveValue('60');
  await expect(status).toHaveText(before);
  const canvas = page.locator('#view-3d');
  await canvas.scrollIntoViewIfNeeded();
  const image = await canvas.evaluate(element => element.toDataURL());
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20);
  await page.mouse.up();
  expect(await canvas.evaluate((element, before) => element.toDataURL() !== before, image)).toBe(true);
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  const plan = await page.locator('#plan-view svg').boundingBox();
  expect(plan.x + plan.width).toBeLessThanOrEqual(375);
  await page.setViewportSize(viewport);
  await shell.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page).toHaveURL(/\/calc\/\?report=/, { timeout: 65000 });
  await expect(page.getByText('PUNCHING SHEAR CHECK – INTERNAL COLUMN (EC2)').first()).toBeVisible({ timeout: 65000 });
});
