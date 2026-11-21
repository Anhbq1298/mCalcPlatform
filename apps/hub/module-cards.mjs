import { tools } from '../registry.mjs';
import { el, link, qs } from './dom.mjs';

export function thumbnail(tool) {
  const art = el('div', undefined, 'thumbnail');
  art.dataset.module = tool?.id ?? 'unavailable';
  art.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index++) art.append(el('i'));
  return art;
}

function moduleCard(tool, pick) {
  const title = tool.title ?? tool.name;
  const card = el(pick ? 'label' : 'article', undefined, 'module-card');
  const info = el('div', undefined, 'module-info');
  info.append(el('h3', title), el('p', [tool.name, tool.code].filter(Boolean).join(' · '), 'module-app'),
    el('p', tool.description, 'muted'));
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
    if (tool.localDraft) {
      standalone.search = '?legacy=1';
      actions.append(link(tool.localDraft, standalone, 'legacy-draft'));
    }
    card.append(actions);
  }
  return card;
}

export function renderCatalog() {
  qs('catalog').replaceChildren(...tools.map(tool => moduleCard(tool, false)));
}

const match = (tool, query) => query.split(/\s+/).every(word =>
  [tool.title, tool.name, tool.code, ...(tool.keywords ?? [])].join(' ').toLowerCase().includes(word));

export function pickModule(destination) {
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
  name.disabled = true;

  function update() {
    add.disabled = !selected || !name.value.trim();
  }

  function renderOptions() {
    const found = tools.filter(tool => match(tool, search.value.trim().toLowerCase()));
    options.replaceChildren(...found.map(tool => {
      const card = moduleCard(tool, true);
      const radio = card.querySelector('input');
      radio.checked = selected?.id === tool.id;
      radio.onchange = () => {
        selected = tool;
        name.disabled = false;
        name.value = tool.title ?? tool.name;
        update();
      };
      return card;
    }));
    qs('no-modules').hidden = found.length > 0;
  }

  modal.onkeydown = event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    modal.close();
  };
  search.oninput = renderOptions;
  name.oninput = update;
  qs('cancel-design').onclick = () => modal.close();
  form.onsubmit = event => {
    event.preventDefault();
    if (add.disabled) return;
    result = { tool: selected, name: name.value.trim() };
    modal.close();
  };
  renderOptions();
  update();
  return new Promise(resolve => {
    modal.addEventListener('close', () => resolve(result), { once: true });
    modal.showModal();
    search.focus();
  });
}
