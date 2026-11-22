import { Window } from '../vendor/calccanvas/node_modules/happy-dom/lib/index.js';
import { expect, test } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';
import { createDesign, exportDesignFile } from '../packages/design-sdk/src/index.mjs';
import { newDefaults } from '../tools/rc-circular-column/src/inputs.mjs';
import circularTool from '../tools/rc-circular-column/tool.json' with { type: 'json' };
import { renderCatalog } from '../apps/hub/module-cards.mjs';

const categories = (scope, name) => scope.getByRole('group', { name: 'Tool categories' }).getByRole('button', { name, exact: true });
const cards = scope => scope.locator('.module-card');
const badge = scope => scope.locator('.design-code');
const library = page => page.locator('#tools');

for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 780 }]) {
  test.describe('Tool browser at ' + viewport.width + 'px', () => {
    test.use({ viewport });

    test('filters the library and keeps category controls and cards within the viewport', async ({ page }) => {
      await page.goto('./#tools');
      const toolLibrary = library(page);
      const search = toolLibrary.getByRole('searchbox', { name: 'Search tools' });
      await expect(categories(toolLibrary, 'All')).toHaveAttribute('aria-pressed', 'true');
      await expect(cards(toolLibrary)).toHaveCount(7);
      for (const [toolName, extension] of [
        ['Calculation Worksheet', 'mccv'], ['RC Column', 'mrcol'], ['Circular RC Column', 'mccol'],
        ['Steel Beam-Column', 'msbc'], ['Composite Beam', 'mcb'], ['Punching Shear', 'mpsh'],
        ['Embedded Plate & Concrete Breakout', 'mcbo'],
      ]) {
        const card = cards(toolLibrary).filter({ has: page.getByRole('heading', { name: toolName, exact: true }) });
        await expect(card.getByRole('button', { name: 'Open .' + extension, exact: true })).toBeVisible();
        await expect(card.locator('input[type=file]')).toHaveAttribute('accept', '.' + extension);
      }
      await expect(badge(toolLibrary)).toHaveText([
        'EC4 · EN 1994-1-1', 'EC2 · EN 1992-4', 'EC2 · EN 1992-1-1', 'EC3 · EN 1993-1-8',
        'EC2 · EN 1992-1-1', 'EC2 · EN 1992-1-1', 'EC2 · EN 1992-1-1', 'EC3 · EN 1993-1-1',
      ]);
      const firstRow = await cards(toolLibrary).evaluateAll(elements =>
        elements.filter(element => element.offsetTop === elements[0].offsetTop).length);
      expect(firstRow).toBe(viewport.width > 1000 ? 4 : 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

      const concrete = categories(toolLibrary, 'Concrete');
      await concrete.focus();
      await page.keyboard.press('Enter');
      await expect(concrete).toBeFocused();
      await expect(concrete).toHaveAttribute('aria-pressed', 'true');
      await expect(cards(toolLibrary)).toHaveCount(4);
      await search.fill('EN-1992-1-1 circular');
      await expect(cards(toolLibrary)).toHaveCount(1);
      await expect(toolLibrary.getByRole('heading', { name: 'Circular RC Column' })).toBeVisible();
      await categories(toolLibrary, 'Steel').click();
      await expect(toolLibrary.getByRole('status')).toHaveText('No modules found');
      await search.clear();
      await expect(badge(toolLibrary)).toHaveText('EC3 · EN 1993-1-1');
      await categories(toolLibrary, 'Composite').click();
      await expect(badge(toolLibrary)).toHaveText('EC4 · EN 1994-1-1');
      await categories(toolLibrary, 'General').click();
      await expect(cards(toolLibrary)).toHaveCount(1);
      await expect(toolLibrary.getByRole('heading', { name: 'Calculation Worksheet' })).toBeVisible();
      await expect(badge(toolLibrary)).toHaveCount(0);
      await expect(page).toHaveURL(/#tools$/);
    });

    test('filters the project picker and preserves a custom name in its folder', async ({ page }) => {
      await page.goto('./#projects');
      await page.getByRole('button', { name: 'New Project' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Project name').fill('Category test');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Add folder', exact: true }).click();
      await dialog.getByLabel('Folder name').fill('Columns');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: '+ Add design module', exact: true }).click();
      await expect(categories(dialog, 'All')).toHaveAttribute('aria-pressed', 'true');
      await expect(cards(dialog)).toHaveCount(7);
      const search = dialog.getByRole('searchbox', { name: 'Search modules' });
      await expect(search).toBeFocused();
      await categories(dialog, 'Concrete').click();
      await expect(badge(dialog)).toHaveText(['EC2 · EN 1992-4', 'EC2 · EN 1992-1-1', 'EC3 · EN 1993-1-8', ...Array(3).fill('EC2 · EN 1992-1-1')]);
      await search.fill('mbcolumn-lite ec2');
      await expect(cards(dialog)).toHaveCount(1);
      await dialog.getByRole('heading', { name: 'RC Column', exact: true }).click();
      const name = dialog.getByRole('textbox', { name: 'Design name' });
      await name.fill('Level 3 column');
      const add = dialog.getByRole('button', { name: 'Add design', exact: true });
      await categories(dialog, 'General').click();
      await expect(add).toBeDisabled();
      await search.clear();
      await expect(badge(dialog)).toHaveCount(0);
      await categories(dialog, 'Concrete').click();
      await expect(name).toHaveValue('Level 3 column');
      await expect(dialog.getByRole('radio', { name: 'RC Column', exact: true })).toBeChecked();
      expect(await dialog.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(
        await dialog.evaluate(element => element.clientWidth));
      await add.click();
      await expect(page.getByRole('heading', { name: 'Category test › Columns' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Level 3 column' })).toHaveAttribute('href', /t\/mbcolumn-lite\/.*design=/);
      await page.reload();
      await expect(page.getByRole('link', { name: 'Level 3 column' })).toBeVisible();
    });
  });
}

test('renders multiple explicit badges and the empty state for an unpopulated category', async () => {
  const window = new Window({ url: 'http://localhost:4180/mCalcPlatform/' });
  const { document } = window;
  document.body.innerHTML = '<input id="tool-search"><div id="tool-categories"></div><div id="catalog"></div><p id="catalog-empty"></p>';
  globalThis.document = document;
  try {
    renderCatalog([
      { id: 'new-steel', category: 'steel', name: 'New steel module', entry: 'new-steel/' },
      {
        id: 'multi', category: 'concrete', name: 'Multiple standards', entry: 'multi/',
        designCodes: [{ id: 'EN-1992-1-1', label: 'EC2 · EN 1992-1-1' }, { id: 'ACI-318', label: 'ACI 318' }],
      },
    ]);
    const selectCategory = name => [...document.querySelectorAll('#tool-categories button')]
      .find(button => button.textContent === name).click();
    expect([...document.querySelectorAll('.design-code')].map(badge => badge.textContent))
      .toEqual(['EC2 · EN 1992-1-1', 'ACI 318']);
    selectCategory('Steel');
    expect(document.querySelector('#catalog h3').textContent).toBe('New steel module');
    expect(document.querySelector('.design-code')).toBeNull();
    selectCategory('Composite');
    expect(document.querySelector('.module-card')).toBeNull();
    expect(document.querySelector('#catalog-empty').textContent).toBe('No design modules available in this category yet.');
  } finally {
    delete globalThis.document;
    await window.close();
  }
});

async function chooseNativeFile(page, extension, payload) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open .' + extension, exact: true }).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(payload);
}

test('opens a tool design file in its calculator and rejects a mismatched extension', async ({ page }) => {
  const design = createDesign(circularTool, 'Imported circular column', { ...newDefaults(), diameter: 960 });
  const file = await exportDesignFile(design, circularTool);
  const payload = { name: 'column.MCCOL', mimeType: 'application/json', buffer: Buffer.from(await file.arrayBuffer()) };
  await page.goto('./#tools');
  await chooseNativeFile(page, 'mrcol', payload);
  await expect(page.getByText('Choose a .mrcol file for RC Column.')).toBeVisible();
  await expect(page).toHaveURL(/#tools$/);
  await chooseNativeFile(page, 'mccol', payload);
  await expect(page).toHaveURL(/t\/rc-circular-column\/\?design=/);
  const shell = page.getByRole('navigation', { name: 'Design workspace' });
  await expect(shell.getByLabel('Design name')).toHaveValue('Imported circular column');
  await expect(page.locator('#diameter')).toHaveValue('960');
  await page.reload();
  await expect(page.locator('#diameter')).toHaveValue('960');
});

test('opens a native worksheet file as an editable Canvas design', async ({ page }) => {
  const worksheet = {
    format: 'calccanvas', version: 3, id: 'imported-canvas-doc', title: 'Imported worksheet',
    shapes: [{ id: 'test-text', type: 'text', x: 80, y: 80, props: { w: 320, html: '<p>Native worksheet contents</p>' } }],
  };
  await page.goto('./#tools');
  await chooseNativeFile(page, 'mccv', {
    name: 'worksheet.mccv', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(worksheet)),
  });
  await expect(page).toHaveURL(/calc\/\?design=/);
  const shell = page.getByRole('navigation', { name: 'Design workspace' });
  await expect(shell.getByLabel('Design name')).toHaveValue(worksheet.title, { timeout: 45000 });
  await expect(page.getByText('Native worksheet contents', { exact: true })).toBeVisible();
  await expect(shell.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});
