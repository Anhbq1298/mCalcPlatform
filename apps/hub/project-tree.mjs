import { button, el } from './dom.mjs';

export function folderBreadcrumb(project, folder) {
  const names = [];
  while (folder) {
    names.unshift(folder.name);
    folder = project.folders.find(item => item.id === folder.parentId);
  }
  return [project.name, ...names].join(' › ');
}

export function renderTree({ projects, project, folder, expanded, select, toggle, showSaved }) {
  const selectedButton = (name, run, selected) => {
    const item = button(name, run);
    item.className = 'tree-name';
    if (selected) item.setAttribute('aria-current', 'true');
    return item;
  };

  function node(name, key, selected, onSelect, children) {
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
      () => select(owner, item), owner.folders.filter(child => child.parentId === item.id)
        .map(child => () => folderNode(owner, child)));
  }

  const tree = el('ul');
  for (const owner of projects) {
    tree.append(node(owner.name, owner.id, owner.id === project?.id && !folder, () => select(owner),
      owner.folders.filter(item => item.parentId === undefined).map(item => () => folderNode(owner, item))));
  }
  const saved = selectedButton('Saved designs', showSaved, !project);
  return [el('h2', 'Project folders'), tree, saved];
}
