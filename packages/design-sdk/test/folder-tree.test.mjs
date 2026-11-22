import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFolders, copyFolderTree, createDesign, createFolder, createProject, descendantIds, moveFolder, removeFolder, restoreFolder, searchProject, sortByName, trashFolder, trashRoots, withFolder } from '../src/index.mjs';

const tool = { id: 'mbcolumn-lite', name: 'RC', version: '1', schema: 1, labels: ['member.column'] };
function sample() {
  let project = createProject('Building');
  const framing = createFolder('Framing'); project = withFolder(project, framing);
  const l3 = createFolder('L3', framing.id); project = withFolder(project, l3);
  const cols = createFolder('Columns', framing.id); project = withFolder(project, cols);
  const other = createFolder('Other'); project = withFolder(project, other);
  const design = createDesign(tool, 'C1', {});
  project = { ...project, folders: project.folders.map(f => f.id === l3.id ? { ...f, designs: [design.id] } : f) };
  return { project, framing, l3, cols, other, design };
}

test('moves a folder but never into itself or its descendants', () => {
  const { project, framing, l3, other } = sample();
  const moved = moveFolder(project, l3.id, other.id);
  assert.equal(moved.folders.find(f => f.id === l3.id).parentId, other.id);
  assert.throws(() => moveFolder(project, framing.id, l3.id), /into itself/);
  assert.throws(() => moveFolder(project, framing.id, framing.id), /into itself/);
  const root = moveFolder(project, l3.id, undefined);
  assert.equal('parentId' in root.folders.find(f => f.id === l3.id), false);
});

test('trash hides the subtree and restore brings it back', () => {
  const { project, framing, l3 } = sample();
  const trashed = trashFolder(project, framing.id, '2026-11-21T12:00:00.000Z');
  assert.equal(activeFolders(trashed).length, activeFolders(project).length - 3);
  assert.deepEqual(trashRoots(trashed).map(f => f.id), [framing.id]);
  const back = restoreFolder(trashed, framing.id);
  assert.equal(activeFolders(back).length, activeFolders(project).length);
  assert.throws(() => restoreFolder(back, framing.id), /not in the trash/);
  assert.ok(descendantIds(project, framing.id).has(l3.id));
});

test('restoring a child of a trashed parent moves it to the root', () => {
  const { project, framing, l3 } = sample();
  const trashed = trashFolder(project, framing.id, 'x');
  const restoredChild = restoreFolder({ ...trashed, folders: trashed.folders.map(f => f.id === l3.id ? { ...f, deletedAt: 'x' } : f) }, l3.id);
  assert.equal('parentId' in restoredChild.folders.find(f => f.id === l3.id), false);
});

test('permanent removal reports designs that were in the subtree', () => {
  const { project, framing, design } = sample();
  const { project: next, designIds } = removeFolder(project, framing.id);
  assert.deepEqual(designIds, [design.id]);
  assert.equal(next.folders.length, project.folders.length - 3);
});

test('copies a subtree with new folder and design ids', () => {
  const { project, framing, l3, design } = sample();
  const { project: next, designMap } = copyFolderTree(project, framing.id, undefined, () => 'new-design');
  assert.equal(next.folders.length, project.folders.length + 3);
  const copies = next.folders.slice(project.folders.length);
  assert.equal(designMap.get(design.id), 'new-design');
  const copiedRoot = copies[0];
  assert.equal(copiedRoot.name, 'Framing');
  assert.equal(copiedRoot.parentId, undefined);
  const copiedChild = copies[1];
  assert.equal(copiedChild.parentId, copiedRoot.id);
  assert.notEqual(copiedChild.id, l3.id);
  assert.deepEqual(copiedChild.designs, ['new-design']);
});

test('search and sort work across folders and designs', () => {
  const { project, design } = sample();
  const byId = new Map([[design.id, design]]);
  const hits = searchProject(project, byId, 'c1');
  assert.deepEqual(hits.map(h => h.kind), ['design']);
  assert.deepEqual(searchProject(project, byId, '  ').length, 0);
  assert.deepEqual(sortByName([{ name: 'B10' }, { name: 'B2' }, { name: 'a' }]).map(i => i.name), ['a', 'B2', 'B10']);
  assert.deepEqual(sortByName([{ name: 'a' }, { name: 'b' }], 'desc').map(i => i.name), ['b', 'a']);
});
