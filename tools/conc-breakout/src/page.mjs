import { renderColumnSummary } from '../../../apps/column-summary.mjs';
import '../../../apps/column-summary.css';
import { toolStatusBadge } from '../../../apps/tool-status.mjs';
import toolManifest from '../tool.json' with { type: 'json' };
import { registerPage } from '../../../apps/tool-page.mjs';
import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';
import { calculate } from './calculate.mjs';
import { buildForm } from './form.mjs';
import { migrateInputs, newDefaults, restoreInputs } from './inputs.mjs';
import { planSvg } from './plan-view.mjs';
import { buildReport } from './report.mjs';
import { sectionSvg } from './section-view.mjs';
import { createViewer } from './viewer3d.mjs';
import { createLayoutEditor } from './layout-editor.mjs';
import { gridToPoints } from './layout.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './style.css';

const wipBadge = toolStatusBadge(toolManifest);
if (wipBadge) document.querySelector('.titlebar h1').after(wipBadge);

const byId = id => document.getElementById(id);
const status = byId('calculation-status');
const summary = byId('column-check-summary');
let state = newDefaults();
let result = null;
let debounce;

let mode = state.layout.mode;
const refreshForm = buildForm(byId('breakout-inputs'), () => state, () => {
  if (state.layout.mode !== mode) { // switching layout mode: seed custom points from the grid once
    mode = state.layout.mode;
    if (mode === 'custom' && !state.layout.points.length) state.layout.points = gridToPoints(state);
    refreshForm();
    editor.refresh();
  }
  schedule();
});
const editor = createLayoutEditor(byId('layout-editor-host'), () => state, schedule);
byId('plan-view').addEventListener('click', event => {
  const svg = byId('plan-view').querySelector('svg');
  if (svg) editor.planClick(svg, event);
});
byId('breakout-inputs').addEventListener('submit', event => event.preventDefault());

const viewer = createViewer(byId('viewer-3d'));
const tabs = [...document.querySelectorAll('.drawing-tabs [role="tab"]')];
for (const tab of tabs) tab.addEventListener('click', () => {
  for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
  if (tab.dataset.tab === 'view3d') viewer.redraw();
});

function schedule() {
  clearTimeout(debounce);
  status.textContent = 'Updating checks…';
  debounce = setTimeout(recalculate, 150);
}

function forceRows(current) {
  const body = byId('force-table').querySelector('tbody');
  const rows = [...current.bars.map(bar => [bar.id, bar.x, bar.y, bar.F, 0]),
    ...current.studs.map(stud => [stud.id, stud.x, stud.y, stud.F, current.Vi])];
  body.replaceChildren(...rows.map(([id, x, y, F, V]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th scope="row">${id}</th><td>${x.toFixed(0)}</td><td>${y.toFixed(0)}</td><td>${(F / 1e3).toFixed(2)}</td><td>${(V / 1e3).toFixed(2)}</td>`;
    return tr;
  }));
}

function recalculate() {
  clearTimeout(debounce);
  try {
    result = calculate(state);
  } catch (error) {
    result = null;
    status.textContent = error.message;
    renderColumnSummary(summary, [], error.message);
    byId('design-status').textContent = '';
    return;
  }
  byId('plan-view').innerHTML = planSvg(result, { selected: editor.selected });
  byId('section-view').innerHTML = sectionSvg(result);
  viewer.update(result);
  forceRows(result);
  renderColumnSummary(summary, result.rows);
  byId('design-status').textContent = 'Design status: ' + result.status + '.';
  byId('check-references').replaceChildren(...result.rows.flatMap(row => {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.textContent = row.ref;
    return [dt, dd];
  }));
  status.textContent = 'Calculation complete.';
}

refreshForm();
editor.refresh();
recalculate();

registerPage('conc-breakout', {
  snapshot: () => structuredClone(state),
  migrate: (inputs, from) => restoreInputs(migrateInputs(inputs, from)),
  restore: inputs => {
    state = restoreInputs(inputs);
    mode = state.layout.mode;
    refreshForm();
    editor.refresh();
    recalculate();
  },
  report: async () => {
    recalculate();
    if (!result) throw new Error(status.textContent);
    return buildReport(result, { pageHeight: A4.h, pageGap: PAGE_GAP, designName: document.title });
  },
});
