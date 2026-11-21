import { activeFolders, descendantIds, folderBreadcrumb, moveFolder, removeFolder, restoreFolder, trashFolder, trashRoots } from '../../packages/design-sdk/src/index.mjs';
import { button, dialog, el, status } from './dom.mjs';

// Folder commands for the hub. Each one computes the new project with the SDK and saves it through the store.
const ROOT = 'root';

export const folderMime = 'application/x-mcalc-folder';
export const designMime = 'application/x-mcalc-design';

function destinationOptions(project, excluded) {
  const options = [[ROOT, 'Project root']];
  for (const folder of activeFolders(project)) {
    if (!excluded.has(folder.id)) options.push([folder.id, folderBreadcrumb(project, folder)]);
  }
  return options;
}

async function chooseDestination(title, confirmLabel, project, excluded, current) {
  const data = await dialog(title, [['Destination', destinationOptions(project, excluded), current ?? ROOT]], confirmLabel);
  if (!data) return undefined;
  const value = data.get('Destination');
  return value === ROOT ? null : value;
}

// Resolves a destination into the SDK's parentId argument (undefined = project root).
const parentArgument = value => (value === null ? undefined : value);

export function folderCommands({ db, refresh, select, project, folder }) {
  return {
    async move() {
      const excluded = descendantIds(project, folder.id);
      const current = project.folders.find(item => item.id === folder.id)?.parentId;
      const target = await chooseDestination('Move folder', 'Move', project, excluded, current);
      if (target === undefined) return;
      await db.updateProject(project.id, latest => moveFolder(latest, folder.id, parentArgument(target)));
      await refresh();
      select(await db.getProject(project.id), folder);
      status('Folder moved.');
    },
    async copy() {
      const target = await chooseDestination('Copy folder to', 'Copy', project, new Set(), folder.parentId ?? null);
      if (target === undefined) return;
      await db.copyFolder(project.id, folder.id, parentArgument(target));
      await refresh();
      status('Folder copied.');
    },
    async trash() {
      const confirmed = await dialog(`Move "${folder.name}" to trash?`, [], 'Move to trash');
      if (!confirmed) return;
      await db.updateProject(project.id, latest => trashFolder(latest, folder.id, new Date().toISOString()));
      await refresh();
      select(await db.getProject(project.id));
      status('Folder moved to trash.');
    },
  };
}

// Trash panel for a project: restore a trashed folder or remove it permanently.
export function trashPanel({ db, refresh, select, project, showFolder }) {
  const roots = trashRoots(project);
  const list = el('ul', undefined, 'trash-list');
  if (!roots.length) list.append(el('li', 'The trash is empty.', 'muted'));
  for (const folder of roots) {
    const item = el('li');
    item.append(el('span', folder.name));
    item.append(button('Restore ' + folder.name, async () => {
      await db.updateProject(project.id, latest => restoreFolder(latest, folder.id));
      await refresh();
      status('Folder restored.');
      showFolder();
    }));
    item.append(button('Delete permanently ' + folder.name, async () => {
      const confirmed = await dialog(`Delete "${folder.name}" permanently?`, [], 'Delete');
      if (!confirmed) return;
      await db.updateProject(project.id, latest => removeFolder(latest, folder.id).project);
      await refresh();
      select(await db.getProject(project.id));
      status('Folder deleted. Its designs remain in Saved designs.');
    }));
    list.append(item);
  }
  const section = el('section', undefined, 'trash-panel');
  section.append(el('h3', 'Trash'), list);
  return section;
}

// Drag and drop: folders can be dropped on a folder or on the project root, designs on a folder.
export function attachDrop(row, { owner, targetId, onDropFolder, onDropDesign }) {
  row.addEventListener('dragover', event => {
    const types = [...event.dataTransfer.types];
    if (types.includes(folderMime) || types.includes(designMime)) event.preventDefault();
  });
  row.addEventListener('drop', event => {
    const folderId = event.dataTransfer.getData(folderMime);
    const designId = event.dataTransfer.getData(designMime);
    if (!folderId && !designId) return;
    event.preventDefault();
    if (folderId) onDropFolder(owner, folderId, targetId);
    if (designId) onDropDesign(owner, designId, targetId);
  });
}

export function startDrag(event, mime, id) {
  event.dataTransfer.setData(mime, id);
  event.dataTransfer.effectAllowed = 'move';
}

