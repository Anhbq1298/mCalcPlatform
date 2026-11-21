import { validateProject } from './documents.mjs';
import { childFolders, folderPath } from './folders.mjs';

// Tree operations for project folders. Every function returns a new project and never mutates its input.
// Trashed folders keep their deletedAt marker on the folder and every descendant.

export const isTrashed = folder => folder.deletedAt !== undefined;

export function activeFolders(project) {
  return project.folders.filter(folder => !isTrashed(folder));
}

export function descendantIds(project, folderId) {
  const ids = new Set([folderId]);
  const queue = [folderId];
  while (queue.length) {
    for (const child of childFolders(project, queue.shift())) {
      if (!ids.has(child.id)) { ids.add(child.id); queue.push(child.id); }
    }
  }
  return ids;
}

function requireFolder(project, folderId) {
  const folder = project.folders.find(item => item.id === folderId);
  if (!folder) throw new Error('The folder is unavailable.');
  return folder;
}

function mapFolders(project, ids, change) {
  return validateProject({
    ...project,
    folders: project.folders.map(item => ids.has(item.id) ? change(item) : item),
  });
}

// parentId undefined moves the folder to the project root.
export function moveFolder(project, folderId, parentId) {
  requireFolder(project, folderId);
  if (parentId !== undefined) {
    requireFolder(project, parentId);
    if (descendantIds(project, folderId).has(parentId)) throw new Error('A folder cannot move into itself.');
  }
  return mapFolders(project, new Set([folderId]), folder => {
    const { parentId: _old, ...rest } = folder;
    return parentId === undefined ? rest : { ...rest, parentId };
  });
}

export function trashFolder(project, folderId, at) {
  requireFolder(project, folderId);
  return mapFolders(project, descendantIds(project, folderId), folder => (
    isTrashed(folder) ? folder : { ...folder, deletedAt: at }));
}

// Restoring a folder whose parent is still trashed moves it to the root, so it stays visible.
export function restoreFolder(project, folderId) {
  const folder = requireFolder(project, folderId);
  if (!isTrashed(folder)) throw new Error('The folder is not in the trash.');
  const ids = descendantIds(project, folderId);
  const parent = folder.parentId === undefined ? undefined : project.folders.find(item => item.id === folder.parentId);
  const detach = parent && isTrashed(parent);
  return mapFolders(project, ids, item => {
    const { deletedAt: _deleted, ...rest } = item;
    if (item.id === folderId && detach) {
      const { parentId: _parent, ...root } = rest;
      return root;
    }
    return rest;
  });
}

export function trashRoots(project) {
  return project.folders.filter(folder => isTrashed(folder)
    && (folder.parentId === undefined || !isTrashed(project.folders.find(item => item.id === folder.parentId) ?? {})));
}

// Permanently removes a folder subtree from the project. Designs stay in the workspace as unfiled designs.
export function removeFolder(project, folderId) {
  requireFolder(project, folderId);
  const ids = descendantIds(project, folderId);
  const designIds = project.folders.filter(folder => ids.has(folder.id)).flatMap(folder => folder.designs);
  const next = validateProject({ ...project, folders: project.folders.filter(folder => !ids.has(folder.id)) });
  return { project: next, designIds };
}

// Copies a folder subtree under parentId. Each design gets a new id from newDesignId(oldId).
export function copyFolderTree(project, folderId, parentId, newDesignId = () => crypto.randomUUID()) {
  requireFolder(project, folderId);
  if (parentId !== undefined) requireFolder(project, parentId);
  const ids = descendantIds(project, folderId);
  const folderIds = new Map([...ids].map(id => [id, crypto.randomUUID()]));
  const designMap = new Map();
  const copies = project.folders.filter(folder => ids.has(folder.id)).map(folder => {
    const { deletedAt: _deleted, parentId: oldParent, ...rest } = folder;
    const designs = folder.designs.map(oldId => {
      if (!designMap.has(oldId)) designMap.set(oldId, newDesignId(oldId));
      return designMap.get(oldId);
    });
    const copy = { ...rest, id: folderIds.get(folder.id), designs };
    if (folder.id === folderId) return parentId === undefined ? copy : { ...copy, parentId };
    return { ...copy, parentId: folderIds.get(oldParent) };
  });
  return { project: validateProject({ ...project, folders: [...project.folders, ...copies] }), designMap };
}

// Returns folders and designs whose name contains the query, with the folder path for display.
export function searchProject(project, designsById, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results = [];
  for (const folder of activeFolders(project)) {
    if (folder.name.toLocaleLowerCase().includes(needle)) {
      results.push({ kind: 'folder', id: folder.id, name: folder.name, path: folderPath(project, folder.id).slice(0, -1) });
    }
    for (const designId of folder.designs) {
      const doc = designsById.get(designId);
      if (doc && doc.meta.name.toLocaleLowerCase().includes(needle)) {
        results.push({ kind: 'design', id: doc.id, name: doc.meta.name, tool: doc.tool, path: folderPath(project, folder.id) });
      }
    }
  }
  return results;
}

export function sortByName(items, direction = 'asc', key = item => item.name) {
  const sign = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => sign * key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' }));
}
