import { expect,test } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';

test('no-notch schedule, catalogue results, SVG, Excel and project reload',async({page})=>{
  await page.goto('./t/fin-plate/');
  await page.getByRole('button',{name:/No notch/}).click();
  await page.getByRole('button',{name:'Generate Schedule'}).click();
  await expect(page.locator('#matrix tbody button, #matrix tr button')).toHaveCount(66);
  await page.locator('#matrix button').filter({hasText:/^D1$/}).first().click();
  await expect(page.locator('#inspection')).toContainText('ABCD web interaction');
  const file=page.waitForEvent('download');await page.locator('#excel').click();expect((await file).suggestedFilename()).toMatch(/xml$/);
  await page.getByRole('button',{name:'Typical Details'}).click();
  await expect(page.locator('#sheet-elevation circle')).not.toHaveCount(0);
  await page.getByLabel('Symbolic dimensions').check();
  await expect(page.locator('#sheet-elevation')).toContainText('p2');
  await page.getByRole('button',{name:'Global Design Criteria'}).click();
  await page.getByLabel('Upper shear boundaries').fill('80, 160');
  const shell=page.getByRole('navigation',{name:'Design workspace'});
  await shell.getByRole('button',{name:'Save',exact:true}).click();
  await expect(shell.getByText('Design saved.')).toBeVisible();
  await page.reload();await expect(page.getByLabel('Upper shear boundaries')).toHaveValue('80, 160');
  await page.getByRole('button',{name:'Generate Schedule'}).click();await expect(page.locator('#matrix button')).toHaveCount(12);
});
