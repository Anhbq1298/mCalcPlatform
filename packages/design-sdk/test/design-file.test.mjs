import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createDesign, designFileName, exportDesignFile, importDesignFile } from '../src/index.mjs';

const tools = await Promise.all((await readdir(new URL('../../../tools/', import.meta.url)))
  .map(dir => readFile(new URL(`../../../tools/${dir}/tool.json`, import.meta.url), 'utf8').then(JSON.parse)));
const byExt = ext => tools.find(tool => tool.fileExtension === ext);
const report = { shapes: [{ id: 'a' }], version: 3 };
const file = (name, text) => new File([text], name, { type: 'application/json' });

test('round-trips each design extension and keeps unknown input fields', async () => {
  for (const ext of ['mrcol', 'mcb', 'mccol', 'msbc']) {
    const tool = byExt(ext);
    const doc = { ...createDesign(tool, 'Col-C1', { laterField: [1, 2] }), report };
    const blob = await exportDesignFile(doc, tool);
    const back = await importDesignFile(file(designFileName(doc, tool), await blob.text()), tools);
    assert.deepEqual(back.inputs, doc.inputs);
    assert.equal(back.tool, tool.id);
    assert.equal(back.meta.name, 'Col-C1');
  }
});

test('every design file stores inputs and a verified report snapshot', async () => {
  for (const ext of ['mrcol', 'mcb', 'mccol', 'msbc']) {
    const tool = byExt(ext);
    const doc = { ...createDesign(tool, 'D1', {}), report };
    const json = JSON.parse(await (await exportDesignFile(doc, tool)).text());
    assert.deepEqual(json.report, report);
    assert.match(json.reportHash, /^[a-f0-9]{64}$/);
  }
});

test('rejects mccv export and mismatched or invalid files', async () => {
  const mccv = byExt('mccv');
  await assert.rejects(exportDesignFile(createDesign(mccv, 'R', {}), mccv), /reports only/);
  const mrcol = byExt('mrcol');
  const text = await (await exportDesignFile(createDesign(mrcol, 'C1', {}), mrcol)).text();
  await assert.rejects(importDesignFile(file('C1.mccol', text), tools), /Invalid design file/);
  await assert.rejects(importDesignFile(file('C1.mccv', text), tools), /Unsupported/);
  await assert.rejects(importDesignFile(file('C1.mrcol', 'not json'), tools), /Invalid design file/);
  const badHash = JSON.stringify({ ...JSON.parse(text), report, reportHash: 'x' });
  await assert.rejects(importDesignFile(file('C1.mrcol', badHash), tools), /Invalid design file/);
});

test('accepts upper-case extensions on import', async () => {
  const mrcol = byExt('mrcol');
  const text = await (await exportDesignFile(createDesign(mrcol, 'C1', {}), mrcol)).text();
  const back = await importDesignFile(file('C1.MRCOL', text), tools);
  assert.equal(back.tool, 'mbcolumn-lite');
});
