import '../../../apps/column-summary.css';
import { toolStatusBadge } from '../../../apps/tool-status.mjs';
import toolManifest from '../tool.json' with { type: 'json' };
import { registerPage } from '../../../apps/tool-page.mjs';
import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';
import { calculateDesign as calculate } from './head.mjs';
import { EXAMPLE_CARDS } from './examples.mjs';
import { cardIcon } from './example-icons.mjs';
import { signSvg } from './sign-view.mjs';
import { stressSvg } from './stress-view.mjs';
import { buildForm } from './form.mjs';
import { htmlSubscripts } from './subscript.mjs';
import { LINK_DIAMETERS, layersToGroups, restoreInputs } from './inputs.mjs';
import { planSvg } from './plan-view.mjs';
import { positionActions } from './position-actions.mjs';
import { renderCompact } from './output-view.mjs';
import { renderArrangementComparison, renderAutoSchedule, renderBasis, renderDetails, renderMessages, renderSchedule, renderSummary } from './results-view.mjs';
import { sectionSvg } from './section-view.mjs';
import { mountTable } from './table-controls.mjs';
import { buildWorksheet } from './worksheet.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './style.css';

const wipBadge = toolStatusBadge(toolManifest);
if (wipBadge) document.querySelector('.titlebar h1').after(wipBadge);

const byId = id => document.getElementById(id);
const form = byId('punching-inputs');
const status = byId('calculation-status');
const combination = byId('combination');
const SCHEMA = 1;
const chooseTemplate = 'Choose a punching shear template.';
let state = null;
let result = null;
let selected = null;
let debounce;

const anchors = { Openings: byId('openings-anchor'), 'Design actions': byId('loads-anchor'), Reinforcement: byId('layers-anchor') };
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
  getRows: () => state.loads, newRow: index => ({ id: crypto.randomUUID(), name: 'ULS ' + (index + 1), V: 0, Mx: 0, My: 0 }), onChange: () => schedule(), minRows: 1,
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
  onEdit: (index, key) => {
    const groups = state.reinforcement.groups;
    if (key === 'st' || key === 'spacing') {
      const affected = key === 'spacing' ? groups.slice(index) : [groups[index]];
      for (const group of affected) { delete group.points; delete group.arrangement; }
    }
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

let selectedCheck = null;
function openDesign(inputs, templateTitle) {
  clearTimeout(debounce);
  state = restoreInputs(inputs);
  selectedCheck = null;
  selected = null;
  byId('active-template').textContent = templateTitle ?? 'Calculation inputs';
  byId('template-picker').hidden = true;
  byId('design-inputs').hidden = false;
  refresh();
  recalculate();
}

for (const card of EXAMPLE_CARDS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'example-card';
  button.innerHTML = cardIcon(card) + `<span>${card.title}</span>`;
  button.addEventListener('click', () => {
    openDesign(card.variants[0].input, card.title + ' template');
    focusField('Column', 'column.shape');
  });
  byId('example-cards').append(button);
}

function focusField(group, path) {
  refreshForm.open(group);
  form.querySelector(`[data-path="${path}"]`).focus();
}

// Drawing tabs: one drawing at a time in the centre column.
const tabs = [...document.querySelectorAll('.drawing-tabs [role="tab"]')];
for (const tab of tabs) tab.addEventListener('click', () => {
  for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
  if (tab.dataset.tab === 'compare') render();
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
byId('layer-lines')?.addEventListener('change', () => render());
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
    result = { status: 'Calculation error', loads: [], issues: [{ state: 'Calculation error', message: error.message }], profile: result?.profile };
    status.textContent = 'Calculation error: ' + error.message;
    status.dataset.tone = 'fail';
  }
  render();
}

function render() {
  if (!result) return;
  combination.closest('label').hidden = !result.loads.length;
  const current = combination.value;
  const duplicate = name => result.loads.filter(load => load.name === name).length > 1;
  combination.replaceChildren(...result.loads.map((load, index) => new Option(
    load.name + (duplicate(load.name) ? ` (row ${index + 1})` : '') + (load.id === result.governing?.loadId ? ' (governing)' : ''), load.id,
  )));
  combination.value = result.loads.some(load => load.id === current) ? current : result.governing?.loadId ?? '';
  byId('design-basis').textContent = result.profile ? `EN 1992-1-1:2004 · ${result.profile.label}` : '';
  const detected = { internal: 'Interior', edge: 'Edge', corner: 'Corner' }[result.position?.kind];
  byId('detected-case').hidden = !detected;
  byId('detected-case').textContent = detected ? `Detected case: ${detected}` : '';
  renderSummary(document.createElement('div'), byId('design-status'), result, combination.value);
  const summary = byId('column-check-summary');
  if (!result.loads.length && result.issues?.length) summary.replaceChildren();
  else renderCompact(summary, result, combination.value, selectedCheck, id => { selectedCheck = id; byId('plan-tab').click(); render(); });
  renderMessages(byId('messages'), result, issue => positionActions(issue, state, focusField));
  renderDetails(byId('checks'), result, combination.value);
  if (result.profile) renderBasis(byId('code-basis'), result.profile);
  else byId('code-basis').replaceChildren();
  const comparisonHost = byId('layout-comparison');
  if (!comparisonHost.closest('[hidden]')) {
    renderArrangementComparison(comparisonHost, result, state, calculate);
    htmlSubscripts(comparisonHost);
  }
  const drawable = Boolean(result.section);
  const preview = result.issues?.some(issue => ['set-back-slab-edge', 'set-back-beta'].includes(issue.code));
  byId('plan-view').innerHTML = drawable || preview ? planSvg(result, { selected, checkId: selectedCheck, loadId: combination.value, layerLines: drawable && byId('layer-lines')?.checked }) : '';
  byId('sign-view').innerHTML = drawable ? signSvg(result) : '';
  byId('stress-view').innerHTML = drawable && result.loads?.length ? stressSvg(result, { load: result.loads.find(item => item.id === combination.value) }) : '';
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
  for (const id of ['column-check-summary', 'design-status', 'messages', 'checks', 'code-basis', 'layer-schedule', 'auto-schedule', 'selection-info']) htmlSubscripts(byId(id));
}

form.addEventListener('submit', event => event.preventDefault());
function showTemplatePicker() {
  byId('template-picker').hidden = false;
  status.textContent = chooseTemplate;
}

if (!new URLSearchParams(location.search).has('design')) showTemplatePicker();

registerPage('punching-shear', {
  reset: showTemplatePicker,
  snapshot: () => {
    if (!state) throw new Error(chooseTemplate);
    return structuredClone(state);
  },
  migrate: (inputs, from) => {
    if (from < 1 || from > SCHEMA) throw new Error('Unsupported punching shear input version.');
    return restoreInputs(inputs);
  },
  restore: inputs => openDesign(inputs),
  report: async () => {
    if (!state) throw new Error(chooseTemplate);
    clearTimeout(debounce);
    result = calculate(state);
    render();
    return buildWorksheet(result, { pageHeight: A4.h, pageGap: PAGE_GAP, designName: document.title });
  },
});
