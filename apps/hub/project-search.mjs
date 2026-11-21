import { el } from './dom.mjs';

// Search results for the whole project. Designs open their containing folder.
export function renderSearch(results, { open, openDesign }) {
  if (!results.length) return [el('p', 'No folders or calculations match this search.', 'muted')];
  const list = el('ul', undefined, 'search-results');
  for (const result of results) {
    const item = el('li');
    const where = result.path.map(folder => folder.name).join(' › ');
    const action = result.kind === 'folder' ? () => open(result) : () => openDesign(result);
    const name = el('button', result.name);
    name.type = 'button';
    name.onclick = action;
    item.append(name, el('span', (result.kind === 'folder' ? 'Folder' : 'Calculation') + (where ? ' · ' + where : ''), 'muted'));
    list.append(item);
  }
  return [list];
}
