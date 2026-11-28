import { expect, test } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';

test('generates the schedule and both parametric typicals from the basic inputs', async ({page}) => {
  await page.goto('./t/fin-plate/');
  await page.getByRole('button', {name:'No Notch Schedule'}).click();
  await expect(page.getByLabel('Bolt size')).toHaveValue('20');
  await expect(page.getByLabel('Fin plate grade')).toHaveValue('275');
  await expect(page.getByLabel('Hole diameter')).toBeHidden();
  await expect(page.getByText('(6 selected)')).toBeVisible();
  await page.getByRole('button', {name:'Generate Schedule'}).click();
  await expect(page.locator('#matrix button')).toHaveCount(66);
  await page.locator('#matrix button').filter({hasText:/^D1$/}).first().click();
  await expect(page.locator('#inspection')).toContainText('ABCD web interaction');
  const single = page.getByRole('img', {name:'Single bolt column (S) elevation'});
  const double = page.getByRole('img', {name:'Double bolt column (D) elevation'});
  await expect(single).toContainText('hp');
  await expect(double).toContainText('p2');
  await expect(page.getByLabel('Symbolic dimensions')).toBeChecked();
  const file = page.waitForEvent('download');
  await page.locator('#excel').click();
  expect((await file).suggestedFilename()).toMatch(/xml$/);

  await page.getByLabel('UB762', {exact:true}).uncheck();
  await page.getByLabel('Number of thresholds').fill('2');
  await page.getByLabel('Custom thresholds').check();
  await page.getByLabel('Threshold 1 (kN)').fill('80');
  await page.getByLabel('Threshold 2 (kN)').fill('160');
  await expect(page.locator('#matrix')).toBeHidden();
  const shell = page.getByRole('navigation', {name:'Design workspace'});
  await shell.getByRole('button', {name:'Save',exact:true}).click();
  await expect(shell.getByText('Design saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Number of thresholds')).toHaveValue('2');
  await expect(page.getByLabel('Threshold 2 (kN)')).toHaveValue('160');
  await expect(page.getByText('(5 selected)')).toBeVisible();
  await page.getByRole('button', {name:'Generate Schedule'}).click();
  await expect(page.locator('#matrix button')).toHaveCount(10);
  await expect(page.locator('#matrix')).toContainText('≤160 kN');
  await expect(double.locator('title')).toHaveText(/Schematic geometry/);
  await page.getByLabel('Bolt size').selectOption('24');
  await page.getByRole('button', {name:'Generate Schedule'}).click();
  await expect(page.locator('#matrix')).toContainText('Outside scope');
});

test('notched beam pairs share project marks across saved designs and schedules', async ({page, context})=>{
  await page.goto('./t/fin-plate/');
  const project=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('mcalc-platform',1);
      req.onupgradeneeded=()=>{for(const name of ['designs','projects'])req.result.createObjectStore(name,{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    const id=crypto.randomUUID();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({id,name:'Shared marks',settings:{},folders:[]});
      tx.oncomplete=resolve;tx.onerror=reject;
    });
    db.close();return id;
  });
  const url=new URL(page.url());
  url.searchParams.set('project',project);
  const other=await context.newPage();
  await Promise.all([page.goto(url.href),other.goto(url.href)]);
  for(const tab of [page,other]){
    await tab.getByRole('button',{name:'Beam-to-Beam with Notch'}).click();
    await tab.getByLabel('Supporting beams',{exact:true}).selectOption({label:'UB 533x210x92'});
    await tab.getByLabel('Supported beams',{exact:true}).selectOption({label:'UB 406x178x74'});
    await tab.getByLabel('Supported beam restraint').selectOption('restrained');
  }
  await other.getByText('Fin plate and bolt grid').click();
  await other.getByLabel('Plate free-edge distance').fill('55');
  await Promise.all([page,other].map(tab=>tab.getByRole('button',{name:'Generate Notch Schedule'}).click()));
  await expect(page.locator('#notch-matrix button')).toHaveText(/N1 \/ S[12]/);
  await expect(other.locator('#notch-matrix button')).toHaveText(/N1 \/ S[12]/);
  const first=await page.locator('#notch-matrix button').textContent();
  const second=await other.locator('#notch-matrix button').textContent();
  expect(first).not.toBe(second);
  await page.locator('#notch-matrix button').click();
  await expect(page.getByRole('img',{name:'Selected beam pair section'})).toContainText('100 × 40 mm');
  await expect(page.getByRole('img',{name:'Typical parametric notch detail'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Typical parametric fin plate detail'})).toBeVisible();
  const shell=page.getByRole('navigation',{name:'Design workspace'});
  await shell.getByRole('button',{name:'Save',exact:true}).click();
  await expect(shell.getByText('Design saved.')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Generate Notch Schedule'}).click();
  await expect(page.locator('#notch-matrix button')).toHaveText(first);
  await page.getByRole('button',{name:'No Notch Schedule'}).click();
  await page.getByLabel('Setback (mm)',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Generate Schedule',exact:true}).click();
  await expect(page.locator('#matrix button').first()).toHaveText(first.split(' / ')[1]);
});
