import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const toolsDir = fileURLToPath(new URL('../../../tools/', import.meta.url));
const manifests = readdirSync(toolsDir)
  .map(dir => JSON.parse(readFileSync(join(toolsDir, dir, 'tool.json'), 'utf8')));

// Agreed file extensions per tool (all lowercase). Master project stays .mcalc.
const expected = {
  calccanvas: 'mccv',
  'composite-beam': 'mcb',
  'mbcolumn-lite': 'mrcol',
  'punching-shear': 'mpsh',
  'rc-circular-column': 'mccol',
  'steel-beam-column': 'msbc',
};

test('every tool declares the agreed file extension', () => {
  for (const manifest of manifests) {
    assert.equal(manifest.fileExtension, expected[manifest.id], `${manifest.id} extension`);
  }
});

test('file extensions are lowercase and unique across tools', () => {
  const extensions = manifests.map(manifest => manifest.fileExtension);
  assert.ok(extensions.every(ext => /^[a-z][a-z0-9]{1,7}$/.test(ext)));
  assert.equal(new Set(extensions).size, extensions.length);
  assert.ok(!extensions.includes('mcalc'), 'mcalc is reserved for the master project package');
});
