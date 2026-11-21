import { validateProject } from './documents.mjs';

// Project folders are a flat list with optional parentId links. These helpers are the only place
// that reads or changes that structure; hub views and storage call them instead of walking it.
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const NAME_LIMIT = 200;

function folderName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('Folder name is required.');
  if (trimmed.length > NAME_LIMIT) throw new Error('Folder name is too long.');
  return trimmed;
}

export function createFolder(name, parentId) {
  if (parentId !== undefined && (typeof parentId !== 'string' || !identifier.test(parentId))) {
    throw new Error('Invalid parent folder.');
  }
  return { id: crypto.randomUUID(), name: folderName(name), designs: [], ...(parentId !== undefined ? { parentId } : {}) };
}

export function withFolder(project, folder) {
  if (project.folders.some(item => item.id === folder.id)) throw new Error('Folder already exists.');
  if (folder.parentId !== undefined && !project.folders.some(item => item.id === folder.parentId)) {
    throw new Error('The parent folder is unavailable.');
  }
  return validateProject({ ...project, folders: [...project.folders, folder] });
}

export function withFolderName(project, folderId, name) {
  const trimmed = folderName(name);
  if (!project.folders.some(item => item.id === folderId)) throw new Error('The folder is unavailable.');
  return validateProject({
    ...project,
    folders: project.folders.map(item => item.id === folderId ? { ...item, name: trimmed } : item),
  });
}

export function childFolders(project, parentId) {
  return project.folders.filter(item => item.parentId === parentId);
}

// Returns the chain from the top-level folder down to the given folder.
export function folderPath(project, folderId) {
  const path = [];
  const seen = new Set();
  let current = project.folders.find(item => item.id === folderId);
  if (!current) throw new Error('The folder is unavailable.');
  while (current) {
    if (seen.has(current.id)) throw new Error('Invalid project folder hierarchy.');
    seen.add(current.id);
    path.unshift(current);
    const parentId = current.parentId;
    current = parentId === undefined ? undefined : project.folders.find(item => item.id === parentId);
    if (parentId !== undefined && !current) throw new Error('Invalid project folder hierarchy.');
  }
  return path;
}

export function folderBreadcrumb(project, folder) {
  return [project.name, ...folderPath(project, folder.id).map(item => item.name)].join(' › ');
}
