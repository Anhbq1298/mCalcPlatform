import '../../../apps/column-summary.css';
import { registerPage } from '../../../apps/tool-page.mjs';
import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';
import { calculateDesign as calculate } from './head.mjs';
import { EXAMPLE_CARDS } from './examples.mjs';
import { cardIcon } from './example-icons.mjs';
import { signSvg } from './sign-view.mjs';
import { stressSvg } from './stress-view.mjs';
import { buildForm } from './form.mjs';
import { htmlSubscripts } from './subscript.mjs';
import { LINK_DIAMETERS, newDefaults, restoreInputs } from './inputs.mjs';
import { newLayer } from './layout.mjs';
import { planSvg } from './plan-view.mjs';
import { renderBasis, renderDetails, renderMessages, renderSchedule, renderSummary } from './results-view.mjs';
import { sectionSvg } from './section-view.mjs';
import { mountTable } from './table-controls.mjs';
import { buildWorksheet } from './worksheet.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './style.css';

const byId = id => document.getElementById(id);
const form = byId('punching-inputs');
const status = byId('calculation-status');
const combination = byId('combination');
const SCHEMA = 1;
let state = newDefaults();
let result = null;
let selected = null;
let debounce;

const anchors = { Openings: byId('openings-anchor'), 'Design actions': byId('loads-anchor'), 'Punching reinforcement': byId('layers-anchor') };
const refreshForm = buildForm(form, anchors, () => state, () => schedule());
const number = 'number';
const refreshOpenings = mountTable(byId('openings-anchor'), {
  caption: 'Openings', columns: [['x', '$X$', number], ['y', '$Y$', number], ['w', 'Width $b$', number], ['h', 'Height $h$', number]],
  getRows: () => state.openings, newRow: () => ({ x: 2500, y: 0, w: 400, h: 400 }), onChange: () => schedule(),
  addLabel: '+ Opening', removeLabel: '− Opening', rowLabel: index => 'O' + (index + 1),
});
const refreshLoads = mountTable(byId('loads-anchor'), {
  caption: 'Load combinations', columns: [['name', 'Name', 'text'], ['V', '$V_{Ed}$', number], ['Mx', '$M_x$', number], ['My', '$M_y$', number]],
  getRows: () => state.loads, newRow: index => ({ name: 'ULS ' + (index + 1), V: 0, Mx: 0, My: 0 }), onChange: () => schedule(), minRows: 1,
  addLabel: '+ Combination', removeLabel: '− Combination', rowLabel: index => String(index + 1),
});
const layerAnchor = byId('layers-anchor');
const layerTableHost = document.createElement('div');
layerAnchor.insertBefore(layerTableHost, layerAnchor.querySelector('.layer-buttons'));
const refreshLayers = mountTable(layerTableHost, {
  caption: 'Link layers',
  columns: [['offset', 'Offset', number], ['diameter', '$\\phi$', 'select', LINK_DIAMETERS.map(value => ({ value, label: String(value) }))],
    ['shape', 'Shape', 'select', [{ value: 'single', label: '1-leg' }, { value: 'double', label: '2-leg' }]], ['links', 'Links', number], ['start', 'Start', number]],
  getRows: () => state.reinforcement.layers,
  newRow: (index, previous) => {
    const layer = newLayer(index, previous);
    if (previous) layer.offset = previous.offset + Math.floor((0.75 * (result?.section?.d ?? 200)) / 5) * 5;
    return layer;
  },
  onChange: () => schedule(), addLabel: '+ Layer', removeLabel: '− Layer', rowLabel: index => 'L' + (index + 1),
});

// Calculation case: worked cases appear as cards only when "Worked case" is chosen.
let activeCard = null;
let activeVariant = null;
function loadVariant(item) {
  state = restoreInputs(item.input);
  activeVariant = item.id;
  byId('example-note').textContent = item.note;
  selected = null;
  renderCards();
  refresh();
  recalculate();
}
function renderCards() {
  const show = byId('case-mode').value === 'cards';
  byId('example-cards').hidden = !show;
  byId('example-variants').hidden = !show || !activeCard || activeCard.variants.length < 2;
  if (!show) return;
  byId('example-cards').replaceChildren(...EXAMPLE_CARDS.map(card => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card';
    button.setAttribute('aria-pressed', String(card === activeCard));
    button.innerHTML = cardIcon(card) + `<span>${card.title}</span>`;
    button.addEventListener('click', () => { activeCard = card; loadVariant(card.variants[0]); });
    return button;
  }));
  if (activeCard) byId('example-variants').replaceChildren(...activeCard.variants.map(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'example-variant';
    chip.dataset.example = item.id;
    chip.setAttribute('aria-pressed', String(activeVariant === item.id));
    chip.textContent = item.label;
    chip.addEventListener('click', () => loadVariant(item));
    return chip;
  }));
  htmlSubscripts(byId('example-variants'));
}
byId('case-mode').addEventListener('input', renderCards);
byId('load-type').addEventListener('input', event => { state.loadType = event.target.value; schedule(); });
byId('combination').addEventListener('input', render);
byId('copy-layout').addEventListener('click', () => {
  if (!result?.layout?.layers?.length) return;
  state.reinforcement.layers = structuredClone(result.layout.layers);
  state.reinforcement.mode = 'provided';
  refresh();
  schedule();
});
byId('omit-link').addEventListener('click', () => {
  const link = result?.layout?.links.find(entry => entry.id === selected);
  if (!link || state.reinforcement.mode !== 'provided') return;
  const layer = state.reinforcement.layers[link.layerIndex];
  layer.omitted = [...new Set([...(layer.omitted || []), link.index])].sort((a, b) => a - b);
  selected = null;
  schedule();
});
byId('restore-links').addEventListener('click', () => {
  const link = result?.layout?.links.find(entry => entry.id === selected);
  const index = link ? link.layerIndex : Number(selected?.slice(1)) - 1;
  const layer = state.reinforcement.layers[index];
  if (layer) layer.omitted = [];
  schedule();
});
byId('plan-view').addEventListener('click', event => {
  const target = event.target.closest('[data-link]');
  selected = target ? target.dataset.link : null;
  render();
});
byId('layer-schedule').addEventListener('click', event => {
  const row = event.target.closest('tr[data-layer]');
  if (row) { selected = row.dataset.layer; render(); }
});

function refresh() {
  refreshForm();
  refreshOpenings();
  refreshLoads();
  refreshLayers();
  byId('load-type').value = state.loadType;
  const provided = state.reinforcement.mode === 'provided';
  layerTableHost.hidden = !provided;
  byId('copy-layout').hidden = provided;
  byId('omit-link').hidden = byId('restore-links').hidden = !provided;
}

function schedule() {
  clearTimeout(debounce);
  status.textContent = 'Updating checks…';
  debounce = setTimeout(recalculate, 120);
}

function recalculate() {
  try {
    result = calculate(state);
    status.textContent = 'Calculation complete · ' + result.status;
  } catch (error) {
    result = null;
    status.textContent = 'Calculation error: ' + error.message;
  }
  render();
}

function render() {
  if (!result) return;
  const names = result.loads.map(load => load.name);
  const current = combination.value;
  combination.replaceChildren(...names.map(name => new Option(name + (name === result.governing?.load ? ' (governing)' : ''), name)));
  combination.value = names.includes(current) ? current : result.governing?.load ?? '';
  renderSummary(byId('column-check-summary'), byId('design-status'), result, combination.value);
  renderMessages(byId('messages'), result);
  renderDetails(byId('checks'), result, combination.value);
  renderBasis(byId('code-basis'), result.profile);
  const drawable = Boolean(result.section);
  byId('plan-view').innerHTML = drawable ? planSvg(result, { selected }) : '';
  byId('sign-view').innerHTML = drawable ? signSvg(result) : '';
  byId('stress-view').innerHTML = drawable && result.loads?.length ? stressSvg(result, { load: result.loads.find(item => item.name === byId('combination').value) }) : '';
  byId('section-view').innerHTML = drawable ? sectionSvg(result, { axis: 'x' }) : '';
  byId('section-view-b').innerHTML = drawable ? sectionSvg(result, { axis: 'y' }) : '';
  const link = result.layout?.links.find(entry => entry.id === selected);
  renderSchedule(byId('layer-schedule'), result, link?.layerId ?? selected);
  byId('selection-info').textContent = link
    ? `${link.id}: layer ${link.layerId}, ${link.shape === 'double' ? 'two-leg' : 'single-leg'} link Ø${link.diameter}, centre (${link.position.x.toFixed(0)}, ${link.position.y.toFixed(0)}) mm, `
      + `${link.legs.filter(leg => leg.effective).length}/${link.legs.length} legs effective${link.legs.some(leg => leg.reason) ? ' (' + link.legs.filter(leg => leg.reason).map(leg => leg.reason).join(', ') + ')' : ''}, ${link.origin === 'auto' ? 'auto-generated' : 'user-defined'}. Anchorage: ${link.anchorage}.`
    : 'Select a link in the plan to inspect it.';
  byId('omit-link').disabled = !(link && state.reinforcement.mode === 'provided');
  byId('restore-links').disabled = !(state.reinforcement.mode === 'provided' && (link || /^L\d+$/.test(selected ?? '')));
  for (const id of ['column-check-summary', 'design-status', 'messages', 'checks', 'code-basis', 'layer-schedule', 'selection-info', 'example-note', 'example-variants']) htmlSubscripts(byId(id));
}

form.addEventListener('submit', event => event.preventDefault());
refresh();
recalculate();

registerPage('punching-shear', {
  snapshot: () => structuredClone(state),
  migrate: (inputs, from) => {
    if (from < 1 || from > SCHEMA) throw new Error('Unsupported punching shear input version.');
    return restoreInputs(inputs);
  },
  restore: inputs => {
    state = restoreInputs(inputs);
    selected = null;
    refresh();
    recalculate();
  },
  report: async () => {
    clearTimeout(debounce);
    result = calculate(state);
    render();
    return buildWorksheet(result, { pageHeight: A4.h, pageGap: PAGE_GAP, designName: document.title });
  },
});
