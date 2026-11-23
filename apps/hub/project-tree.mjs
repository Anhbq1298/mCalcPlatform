import { childFolders, isTrashed, sortByName } from '../../packages/design-sdk/src/index.mjs';
import { button, el } from './dom.mjs';
import { attachDrop, folderMime, startDrag } from './folder-actions.mjs';

// Renders the project tree. Trashed folders are hidden; children are sorted by name.
export function renderTree({ projects, project, folder, expanded, select, toggle, showSaved, direction = 'asc', onDropFolder, onDropDesign }) {
  const selectedButton = (name, run, selected) => {
    const item = button(name, run);
    item.className = 'tree-name';
    if (selected) item.setAttribute('aria-current', 'true');
    return item;
  };
  const childrenOf = (owner, parentId) => sortByName(childFolders(owner, parentId).filter(item => !isTrashed(item)), direction);

  function node(name, key, selected, onSelect, children, { owner, targetId, dragId } = {}) {
    const item = el('li');
    const row = el('div', undefined, 'tree-row');
    const open = expanded.has(key);
    if (children.length) {
      const disclosure = button(open ? '▾' : '▸', () => toggle(key));
      disclosure.className = 'disclosure';
      disclosure.setAttribute('aria-label', (open ? 'Collapse ' : 'Expand ') + name);
      disclosure.setAttribute('aria-expanded', String(open));
      disclosure.dataset.disclosure = key;
      row.append(disclosure);
    }
    if (dragId) {
      row.draggable = true;
      row.addEventListener('dragstart', event => startDrag(event, folderMime, dragId));
    }
    if (owner) attachDrop(row, { owner, targetId, onDropFolder, onDropDesign });
    row.append(selectedButton(name, onSelect, selected));
    item.append(row);
    if (children.length && open) {
      const list = el('ul');
      list.append(...children.map(makeChild => makeChild()));
      item.append(list);
    }
    return item;
  }

  function folderNode(owner, item) {
    return node(item.name, owner.id + '/' + item.id, owner.id === project?.id && item.id === folder?.id,
      () => select(owner, item), childrenOf(owner, item.id).map(child => () => folderNode(owner, child)),
      { owner, targetId: item.id, dragId: item.id });
  }

  const tree = el('ul');
  for (const owner of projects) {
    tree.append(node(owner.name, owner.id, owner.id === project?.id && !folder, () => select(owner),
      childrenOf(owner).map(item => () => folderNode(owner, item)), { owner, targetId: undefined }));
  }
  const saved = selectedButton('Saved designs', showSaved, !project);
  return [el('h2', 'Project folders'), tree, saved];
}
