import test from 'node:test';
import assert from 'node:assert/strict';
import { childFolders, createFolder, createProject, folderBreadcrumb, folderPath, withFolder, withFolderName } from '../src/index.mjs';

const base = () => createProject('Building');
test('creates, nests, and renames folders', () => {
  let project = base();
  const top = createFolder('  Framing  ');
  assert.equal(top.name, 'Framing');
  project = withFolder(project, top);
  const level = createFolder('L3', top.id);
  project = withFolder(project, level);
  assert.deepEqual(childFolders(project, top.id).map(item => item.name), ['L3']);
  assert.ok(childFolders(project).some(item => item.id === top.id));
  project = withFolderName(project, level.id, 'Level 3');
  assert.equal(folderBreadcrumb(project, level), 'Building › Framing › Level 3');
});

test('returns the path from top-level folder down to the target', () => {
  let project = base();
  const a = createFolder('A'); project = withFolder(project, a);
  const b = createFolder('B', a.id); project = withFolder(project, b);
  assert.deepEqual(folderPath(project, b.id).map(item => item.name), ['A', 'B']);
});

test('rejects invalid names, unknown parents, duplicate ids, and unknown folders', () => {
  const project = base();
  assert.throws(() => createFolder('   '), /name is required/);
  assert.throws(() => createFolder('x'.repeat(201)), /too long/);
  assert.throws(() => createFolder('A', 'bad id!'), /Invalid parent/);
  const orphan = createFolder('Orphan', 'missing-parent');
  assert.throws(() => withFolder(project, orphan), /parent folder is unavailable/);
  const folder = createFolder('A');
  const once = withFolder(project, folder);
  assert.throws(() => withFolder(once, folder), /already exists/);
  assert.throws(() => withFolderName(once, 'nope', 'B'), /unavailable/);
  assert.throws(() => folderPath(once, 'nope'), /unavailable/);
});
