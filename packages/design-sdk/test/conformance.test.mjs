import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDesign, createProject, duplicateDesign, exportPackage, importPackage, parseDesign, validateProject } from '../src/index.mjs';
import { decodeZip, encodeZip } from '../src/zip.mjs';

const fixtures = await Promise.all(['calccanvas','steel-beam-column','composite-beam','mbcolumn-lite'].map(async id => {
  const path = new URL('../../../tools/' + id + '/tool.json', import.meta.url);
  return JSON.parse(await readFile(path, 'utf8'));
}));
test('keeps tool identity and unknown fields in design packages', async () => {
  for (const tool of fixtures) {
    const doc = createDesign(tool, tool.name, { fixture: { value: 15 }, laterField: [1, 2] });
    const blob = await exportPackage({ designs: [doc] });
    assert.equal(blob.type, 'application/zip');
    const { designs } = await importPackage(blob);
    assert.deepEqual(designs[0].inputs, doc.inputs);
    assert.equal(designs[0].tool, tool.id);
    assert.notEqual(duplicateDesign(doc).id, doc.id);
  }
});
test('keeps project order, future schema, and report snapshots', async () => {
  const [canvas, steel] = fixtures;
  const a = { ...createDesign(canvas, 'A', {}), schema: 20, report: { shapes: [], version: 3 } };
  const b = createDesign(steel, 'B', {});
  const project = createProject('Building');
  project.folders[0].designs.push(b.id, a.id);
  const result = await importPackage(await exportPackage({ designs: [a, b], project }));
  assert.deepEqual(result.project, project);
  assert.equal(result.designs[0].schema, 20);
  assert.deepEqual(result.designs[0].report, a.report);
  assert.match(result.designs[0].reportHash, /^[a-f0-9]{64}$/);
  await assert.rejects(() => exportPackage({ designs: [a], project }), /missing a referenced design/);
  project.folders[1].designs.push(a.id);
  assert.throws(() => validateProject(project), /Invalid project design reference/);
});
test('rejects corrupt files and invalid ZIP paths', async () => {
  const input = new Uint8Array([12, 15, 42]);
  const bytes = new Uint8Array(await encodeZip(new Map([['x', input]])).arrayBuffer());
  bytes[31] = 0;
  await assert.rejects(() => decodeZip(new Blob([bytes])), /integrity/);
  await assert.rejects(() => decodeZip(encodeZip(new Map([['../x', input]]))), /path/);
  await assert.rejects(() => importPackage(new Blob(['invalid'])), /Invalid package/);
  assert.throws(() => parseDesign({ ...createDesign(fixtures[0], 'A', {}), id: '../unsafe' }), /Invalid design/);
});
