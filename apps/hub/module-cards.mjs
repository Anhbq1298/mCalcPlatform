import { emptyToolMessage, filterTools, toolCategories } from '../tool-filters.mjs';
import { toolStatusBadge } from '../tool-status.mjs';
import { el, link, qs } from './dom.mjs';

export function thumbnail(tool) {
  const art = el('div', undefined, 'thumbnail');
  art.dataset.module = tool?.id ?? 'unavailable';
  art.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index++) art.append(el('i'));
  return art;
}

function nativeFileButton(tool, openFile) {
  const extension = '.' + tool.fileExtension;
  const input = el('input');
  input.type = 'file';
  input.accept = extension;
  input.hidden = true;
  const open = el('button', 'Open ' + extension);
  open.type = 'button';
  const message = el('output', undefined, 'tool-file-error');
  message.setAttribute('aria-live', 'polite');
  open.onclick = () => input.click();
  input.onchange = async () => {
    const [file] = input.files;
    if (!file || open.disabled) return;
    input.value = '';
    open.disabled = true;
    message.textContent = '';
    try { await openFile(file, tool); }
    catch (error) { message.textContent = error.message; }
    finally { open.disabled = false; }
  };
  return [open, input, message];
}

function moduleCard(tool, pick, openFile) {
  const title = tool.title ?? tool.name;
  const card = el(pick ? 'label' : 'article', undefined, 'module-card');
  const info = el('div', undefined, 'module-info');
  info.append(el('h3', title), el('p', tool.name, 'module-app'));
  const status = toolStatusBadge(tool);
  if (tool.designCodes?.length || status) {
    const badges = el('div', undefined, 'design-codes');
    if (status) badges.append(status);
    badges.append(...(tool.designCodes ?? []).map(code => el('span', code.label, 'design-code')));
    info.append(badges);
  }
  info.append(el('p', tool.description, 'muted'));
  if (pick) {
    const radio = el('input', undefined, 'module-radio');
    radio.type = 'radio';
    radio.name = 'module';
    radio.value = tool.id;
    radio.setAttribute('aria-label', title);
    const check = el('span', '✓', 'module-check');
    check.setAttribute('aria-hidden', 'true');
    card.append(radio, check);
  }
  card.append(thumbnail(tool), info);
  if (!pick) {
    const standalone = new URL(tool.entry, document.baseURI);
    standalone.searchParams.set('new', '1');
    const actions = el('div', undefined, 'module-actions');
    actions.append(link('New design', standalone, 'button'));
    if (tool.fileExtension) actions.append(...nativeFileButton(tool, openFile));
    card.append(actions);
  }
  return card;
}

function browseTools({ tools, search, categories, results, empty, renderCards }) {
  let category = 'all';
  const tabs = toolCategories.map(([id, label]) => {
    const tab = el('button', label);
    tab.type = 'button';
    tab.setAttribute('aria-controls', results.id);
    tab.onclick = () => {
      category = id;
      render();
    };
    return [id, tab];
  });
  categories.replaceChildren(...tabs.map(([, tab]) => tab));

  function render() {
    for (const [id, tab] of tabs) tab.setAttribute('aria-pressed', String(id === category));
    const inCategory = filterTools(tools, { category });
    const found = filterTools(inCategory, { query: search.value });
    renderCards(found);
    const message = found.length ? '' : emptyToolMessage(inCategory.length > 0);
    if (empty.textContent !== message) empty.textContent = message;
  }

  search.oninput = render;
  render();
}

export function renderCatalog(tools, openFile) {
  const results = qs('catalog');
  browseTools({
    tools,
    search: qs('tool-search'),
    categories: qs('tool-categories'),
    results,
    empty: qs('catalog-empty'),
    renderCards: found => results.replaceChildren(...found.map(tool => moduleCard(tool, false, openFile))),
  });
}

export function pickModule(destination, tools) {
  const modal = qs('module-picker');
  const form = modal.querySelector('form');
  const search = qs('module-search');
  const options = qs('module-options');
  const name = qs('design-name');
  const add = qs('add-design');
  let selected;
  let result;
  qs('picker-destination').textContent = destination;
  form.reset();
  let shown = [];

  function update() {
    name.disabled = !shown.includes(selected);
    add.disabled = name.disabled || !name.value.trim();
  }

  function renderOptions(found) {
    shown = found;
    options.replaceChildren(...found.map(tool => {
      const card = moduleCard(tool, true);
      const radio = card.querySelector('input');
      radio.checked = selected?.id === tool.id;
      radio.onchange = () => {
        selected = tool;
        name.value = tool.title ?? tool.name;
        update();
      };
      return card;
    }));
    update();
  }

  modal.onkeydown = event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    modal.close();
  };
  name.oninput = update;
  qs('cancel-design').onclick = () => modal.close();
  form.onsubmit = event => {
    event.preventDefault();
    if (add.disabled) return;
    result = { tool: selected, name: name.value.trim() };
    modal.close();
  };
  browseTools({
    tools,
    search,
    categories: qs('module-categories'),
    results: options,
    empty: qs('no-modules'),
    renderCards: renderOptions,
  });
  return new Promise(resolve => {
    modal.addEventListener('close', () => resolve(result), { once: true });
    modal.showModal();
    search.focus();
  });
}
