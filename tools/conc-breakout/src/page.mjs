import { renderBreakoutSummary } from './check-summary.mjs';
import '../../../apps/column-summary.css';
import { toolStatusBadge } from '../../../apps/tool-status.mjs';
import toolManifest from '../tool.json' with { type: 'json' };
import { registerPage } from '../../../apps/tool-page.mjs';
import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';
import { legacyLoading } from './loads.mjs';
import { renderLoads } from './load-display.mjs';
import { spatialSection } from './spatial-drawings.mjs';
import { buildForm } from './form.mjs';
import { migrateInputs, newConnectionDefaults, restoreInputs } from './inputs.mjs';
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
let state = newConnectionDefaults();
let result = null;
let debounce;
let job;
let revision = 0;
let renderedRevision = -1;
let loadMode = state.loading.model;

let mode = state.layout.mode;
const refreshForm = buildForm(byId('breakout-inputs'), () => state, () => {
  if (state.loading.model !== loadMode) {
    loadMode = state.loading.model;
    refreshForm();
    editor.refresh();
  } else if (loadMode === 'legacy') {
    const updated = legacyLoading(state.actions);
    Object.assign(state.loading.point, updated.point);
    Object.assign(state.loading.applied, updated.applied);
  }
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

function cancelJob() {
  if (!job) return;
  job.worker.terminate();
  job.resolve(null);
  job = null;
}

function schedule() {
  clearTimeout(debounce);
  revision++;
  cancelJob();
  byId('design-status').textContent = '';
  status.textContent = 'Updating checks…';
  debounce = setTimeout(recalculate, 150);
}

function forceRows(current) {
  const body = byId('force-table').querySelector('tbody');
  body.replaceChildren(...[...current.bars, ...current.studs].map(anchor => {
    const { id, x, y, F, Vx = 0, Vy = current.studs.includes(anchor) ? -current.Vi : 0 } = anchor;
    const unresolved = current.loadingResult && current.eq.shearIssue && current.studs.includes(anchor);
    const tr = document.createElement('tr');
    const selector = Object.assign(document.createElement('button'), { type: 'button', textContent: id });
    selector.addEventListener('click', () => {
      const ratios = Object.entries(anchor.ratios ?? {}).map(([key, value]) => key + ' UR ' + value.toFixed(3));
      const checks = current.rows.filter(row => row.label.startsWith(id + ' ') && Number.isFinite(row.ratio));
      const governing = checks.sort((a, b) => b.ratio - a.ratio)[0];
      byId('anchor-detail').textContent = [id, 'Ø' + (anchor.d ?? current.input.studs.d) + ' mm',
        ...(anchor.k ? ['Axial stiffness ' + anchor.k.toFixed(0) + ' N/mm'] : []),
        ...(anchor.shearK ? ['Shear stiffness ' + anchor.shearK.toFixed(0) + ' N/mm'] : []),
        ...ratios, ...(governing ? ['Governing available check ' + governing.label] : [])].join(' · ');
    });
    tr.insertCell().append(selector);
    for (const value of [x.toFixed(1), y.toFixed(1), (F / 1e3).toFixed(2), ...(unresolved ? ['—', '—'] : [(Vx / 1e3).toFixed(2), (Vy / 1e3).toFixed(2)])]) tr.insertCell().textContent = value;
    return tr;
  }));
  byId('anchor-detail').textContent = '';
}

function recalculate() {
  clearTimeout(debounce);
  if (job) return job.promise;
  if (renderedRevision === revision && result) return Promise.resolve(result);
  const started = revision;
  const worker = new Worker(new URL('./calculate.worker.mjs', import.meta.url), { type: 'module' });
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  job = { worker, resolve, promise };
  function finish(data) {
    worker.terminate();
    if (job?.worker !== worker || revision !== started) return;
    job = null;
    result = data.result ?? null;
    renderedRevision = started;
    if (result) renderResult();
    else {
      status.textContent = data.error;
      renderBreakoutSummary(summary, [], data.error);
      byId('design-status').textContent = '';
      for (const id of ['plan-view', 'section-view', 'section-x-view', 'equivalent-loads', 'anchor-detail', 'check-references']) byId(id).replaceChildren();
      byId('force-table').tBodies[0].replaceChildren();
      viewer.update(null);
    }
    resolve(result);
  }
  worker.onmessage = event => finish(event.data);
  worker.onerror = event => finish({ error: event.message || 'Calculation worker failed.' });
  worker.onmessageerror = () => finish({ error: 'Calculation results could not be read.' });
  status.textContent = 'Calculating…';
  worker.postMessage(state);
  return promise;
}

function renderResult() {
  byId('plan-view').innerHTML = planSvg(result, { selected: editor.selected });
  byId('section-view').innerHTML = result.loadingResult ? spatialSection(result, 'Y') : sectionSvg(result);
  byId('section-x-view').innerHTML = spatialSection(result, 'X');
  renderLoads(byId('equivalent-loads'), result);
  viewer.update(result);
  forceRows(result);
  renderBreakoutSummary(summary, result.rows);
  byId('design-status').textContent = 'Design status: ' + result.status + '.';
  byId('check-references').replaceChildren(...result.rows.flatMap(row => {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.textContent = [row.detail, row.ref].filter(Boolean).join(' · ');
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
    state.loading ??= { ...legacyLoading(state.actions), model: 'legacy' };
    mode = state.layout.mode;
    loadMode = state.loading.model;
    refreshForm();
    editor.refresh();
    schedule();
    return recalculate();
  },
  report: async () => {
    const current = await recalculate();
    if (!current) throw new Error(status.textContent);
    return buildReport(current, { pageHeight: A4.h, pageGap: PAGE_GAP, designName: document.title });
  },
});
