import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { emptyToolMessage, filterTools } from '../apps/tool-filters.mjs';

const toolRoot = new URL('../tools/', import.meta.url);
const tools = readdirSync(toolRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => JSON.parse(readFileSync(new URL(entry.name + '/tool.json', toolRoot), 'utf8')));
const ids = matches => matches.map(tool => tool.id).sort();

test('lists registered tools under All and their declared category', () => {
  assert.deepEqual(filterTools(tools), tools);
  for (const [category, expected] of [
    ['concrete', ['mbcolumn-lite', 'punching-shear', 'rc-circular-column']],
    ['steel', ['steel-beam-column']],
    ['composite', ['composite-beam']],
    ['general', ['calccanvas']],
  ]) {
    assert.deepEqual(ids(filterTools(tools, { category })), expected);
  }
});

test('searches names, IDs, categories and explicit codes with case and punctuation ignored', () => {
  for (const [query, expected] of [
    ['mCaLcCaNvAs', ['calccanvas']],
    ['punching-SHEAR', ['punching-shear']],
    ['gEnErAl', ['calccanvas']],
    ['EC2 · EN 1992-1-1', ['mbcolumn-lite', 'punching-shear', 'rc-circular-column']],
    ['en-1993-1-1', ['steel-beam-column']],
    ['ec4', ['composite-beam']],
    ['RC COLUMN', ['mbcolumn-lite', 'rc-circular-column']],
  ]) {
    assert.deepEqual(ids(filterTools(tools, { query })), expected);
  }
  assert.deepEqual(ids(filterTools(tools, { category: 'concrete', query: 'circular ec2' })), ['rc-circular-column']);
  assert.deepEqual(filterTools(tools, { category: 'general', query: 'ec2' }), []);
});

test('supports future registrations and uses only their explicitly declared standards', () => {
  const future = { id: 'future-steel', category: 'steel' };
  const multiCode = {
    id: 'multiple-standards', category: 'concrete',
    designCodes: [{ id: 'EN-1992-1-1', label: 'EC2 · EN 1992-1-1' }, { id: 'ACI-318', label: 'ACI 318' }],
  };
  const registry = [future, multiCode];
  assert.deepEqual(filterTools(registry, { category: 'steel' }), [future]);
  assert.deepEqual(filterTools(registry, { category: 'steel', query: 'EC3' }), []);
  assert.deepEqual(filterTools(registry, { category: 'concrete', query: 'ec2 aci-318' }), [multiCode]);
  assert.deepEqual(filterTools(registry, { category: 'composite' }), []);
  assert.equal(emptyToolMessage(false), 'No design modules available in this category yet.');
  assert.equal(emptyToolMessage(true), 'No modules found');
});
