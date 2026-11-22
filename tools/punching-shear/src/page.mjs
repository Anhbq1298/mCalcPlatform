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
import { LINK_DIAMETERS, layersToGroups, newDefaults, restoreInputs } from './inputs.mjs';
import { planSvg } from './plan-view.mjs';
import { renderCompact } from './output-view.mjs';
import { renderAutoSchedule, renderBasis, renderDetails, renderMessages, renderSchedule, renderSummary } from './results-view.mjs';
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
refreshForm.open('Column');
byId('show-all-inputs').addEventListener('input', event => refreshForm.showAll(event.target.checked));
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
// Read-only schedule of the auto arrangement, under the custom-layout area in the same card.
const autoSchedule = document.createElement('div');
autoSchedule.id = 'auto-schedule';
autoSchedule.className = 'wide';
layerAnchor.after(autoSchedule);
const layerTableHost = document.createElement('div');
layerAnchor.insertBefore(layerTableHost, layerAnchor.querySelector('.layer-buttons:not(.arrangement-head)'));
// Link arrangement: one row per layer, radial spacing s from the previous layer (L1 from the column
// face) and links at tangential spacing s_t along the layer.
const refreshLayers = mountTable(layerTableHost, {
  caption: 'Link arrangement',
  columns: [['spacing', 's (mm)', number], ['diameter', 'Ø', 'select', LINK_DIAMETERS.map(value => ({ value, label: String(value) }))],
    ['shape', 'Legs', 'select', [{ value: 'single', label: '1' }, { value: 'double', label: '2' }]], ['st', 's_t (mm)', number]],
  getRows: () => state.reinforcement.groups,
  newRow: (index, previous) => {
    const d = result?.section?.d ?? 200;
    const step = Math.floor((previous ? 0.75 * d : 0.4 * d) / 5) * 5;
    return { spacing: step, diameter: previous?.diameter ?? 10, shape: previous?.shape ?? 'single', st: previous?.st ?? Math.floor((1.5 * d) / 5) * 5 };
  },
  onChange: () => schedule(), addLabel: '+ Layer', removeLabel: '− Layer', rowLabel: index => 'L' + (index + 1),
});
for (const cell of layerTableHost.querySelectorAll('thead th')) {
  if (cell.textContent !== 's_t (mm)') continue;
  // (i) next to s_t: what the tangential spacing is and its EC2 limits.
  cell.innerHTML = 's<sub>t</sub> <button type="button" class="info-button" aria-label="What is s_t?" aria-expanded="false">i</button>';
  const note = document.createElement('p');
  note.className = 'info-note';
  note.hidden = true;
  note.innerHTML = '<b>s<sub>t</sub></b>: tangential spacing, centre to centre of the links along one layer (mm). '
    + 'Links per layer = layer length / s<sub>t</sub>, rounded up, so outer layers get more links. '
    + 'EC2 §9.4.3(1): s<sub>t</sub> ≤ 1.5d within 2d of the loaded area, ≤ 2d further out (checked per layer).';
  layerTableHost.querySelector('table').before(note);
  const button = cell.querySelector('button');
  button.addEventListener('click', () => {
    note.hidden = !note.hidden;
    button.setAttribute('aria-expanded', String(!note.hidden));
  });
}

// Calculation case: worked cases appear as cards only when "Worked case" is chosen.
let activeCard = null;
let selectedCheck = null;
let activeVariant = null;
function loadVariant(item) {
  state = restoreInputs(item.input);
  activeVariant = item.id;
  selectedCheck = null;
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
// Drawing tabs: one drawing at a time in the centre column.
const tabs = [...document.querySelectorAll('.drawing-tabs [role="tab"]')];
for (const tab of tabs) tab.addEventListener('click', () => {
  for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
});
byId('load-type').addEventListener('input', event => { state.loadType = event.target.value; schedule(); });
byId('combination').addEventListener('input', render);
// Switching to the custom layout with an empty table starts from the current auto arrangement, one row
// per layer, so the engineer edits a layout that already works.
function prefillCustom() {
  if (!state.reinforcement.enabled || state.reinforcement.mode !== 'provided' || state.reinforcement.groups?.length) return false;
  const auto = calculate({ ...state, reinforcement: { ...state.reinforcement, mode: 'auto' } });
  const layers = auto.layout?.layers ?? [];
  if (!layers.length) return false;
  state.reinforcement.groups = layersToGroups(layers, auto.layout.summary);
  state.reinforcement.omitted = {};
  refreshLayers();
  return true;
}
byId('omit-link').addEventListener('click', () => {
  const link = result?.layout?.links.find(entry => entry.id === selected);
  if (!link || state.reinforcement.mode !== 'provided') return;
  const omitted = state.reinforcement.omitted ??= {};
  omitted[link.layerId] = [...new Set([...(omitted[link.layerId] || []), link.index])].sort((a, b) => a - b);
  selected = null;
  schedule();
});
byId('restore-links').addEventListener('click', () => {
  const link = result?.layout?.links.find(entry => entry.id === selected);
  const id = link ? link.layerId : selected;
  if (id && state.reinforcement.omitted) delete state.reinforcement.omitted[id];
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
  showLayout();
}

// The custom layout table (and its link editing buttons) shows only in custom mode.
function showLayout() {
  byId('layers-anchor').hidden = !(state.reinforcement.enabled && state.reinforcement.mode === 'provided');
  autoSchedule.hidden = !(state.reinforcement.enabled && state.reinforcement.mode === 'auto');
}

function schedule() {
  prefillCustom();
  showLayout();
  clearTimeout(debounce);
  status.textContent = 'Updating checks…';
  debounce = setTimeout(recalculate, 120);
}

function recalculate() {
  try {
    result = calculate(state);
    status.textContent = result.status + (Number.isFinite(result.governing?.ur) ? ` · UR ${result.governing.ur.toFixed(2)}` : '');
    status.dataset.tone = result.status === 'Pass' ? 'pass' : result.status === 'Fail' ? 'fail' : 'warn';
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
  renderSummary(document.createElement('div'), byId('design-status'), result, combination.value);
  renderCompact(byId('column-check-summary'), result, combination.value, selectedCheck, id => { selectedCheck = id; render(); });
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
  if (!autoSchedule.hidden) renderAutoSchedule(autoSchedule, result);
  byId('selection-info').textContent = link
    ? `${link.id}: layer ${link.layerId}, ${link.shape === 'double' ? 'two-leg' : 'single-leg'} link Ø${link.diameter}, centre (${link.position.x.toFixed(0)}, ${link.position.y.toFixed(0)}) mm, `
      + `${link.legs.filter(leg => leg.effective).length}/${link.legs.length} legs effective${link.legs.some(leg => leg.reason) ? ' (' + link.legs.filter(leg => leg.reason).map(leg => leg.reason).join(', ') + ')' : ''}, ${link.origin === 'auto' ? 'auto-generated' : 'user-defined'}. Anchorage: ${link.anchorage}.`
    : 'Select a link in the plan to inspect it.';
  byId('omit-link').disabled = !(link && state.reinforcement.mode === 'provided');
  byId('restore-links').disabled = !(state.reinforcement.mode === 'provided' && (link || /^L\d+$/.test(selected ?? '')));
  for (const id of ['column-check-summary', 'design-status', 'messages', 'checks', 'code-basis', 'layer-schedule', 'auto-schedule', 'selection-info', 'example-note', 'example-variants']) htmlSubscripts(byId(id));
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
