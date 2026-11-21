import { renderColumnSummary, resistanceRow } from '../../../apps/column-summary.mjs';
import '../../../apps/column-summary.css';
import { registerPage } from '../../../apps/tool-page.mjs';
import { defaults, inputGroups, validateInputs, restoreInputs, migrateSavedInputs } from './inputs.mjs';
import { mountLayerTables } from './layer-tables.mjs';
import { detailingChecks } from './detailing.mjs';
import { drawInteraction, drawSection } from './drawing.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './style.css';

const byId = id => document.getElementById(id);
const form = byId('column-inputs');
const status = byId('calculation-status');
const section = byId('circular-section');
const legend = byId('section-legend');
const curve = byId('interaction-curve');
const checks = byId('checks');
const summary = byId('column-check-summary');
let state = structuredClone(defaults);
let rendered;
let worker;
let pending;
let revision = 0;
let requestId = 0;
let debounce;
let calculation;
const updateDelay = 250;

for (const [title, fields] of inputGroups) {
  const group = document.createElement('fieldset');
  const heading = document.createElement('legend');
  heading.textContent = title;
  group.append(heading);
  for (const [id, label, , min, max, step] of fields) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.type = ['classA', 'reducedZone'].includes(id) ? 'checkbox' : 'number';
    input.step = step ?? 'any';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    row.append(name, input);
    group.append(row);
  }
  form.append(group);
}

const renderLayers = mountLayerTables(form, () => state, () => { scheduleCalculation(); draw(); });
function detailingRows() {
  return detailingChecks(state).checks.map(c => ({ label: c.message, status: c.status === 'review' ? 'incomplete' : c.status,
    statusLabel: c.status === 'review' ? 'Review' : undefined,
    detail: c.value === null ? undefined : c.value.toFixed(2) + ' mm' + (c.limit === null ? '' : ' / threshold ' + c.limit.toFixed(2) + ' mm') }));
}
function renderChecks(result, message) {
  const rows = detailingRows();
  renderColumnSummary(summary, [
    ...(result ? [resistanceRow('P–M utilization', result.combined),
      resistanceRow('Conditional shear utilization', result.shear)] : []),
    ...rows.filter(row => row.status === 'fail'),
    { label: 'Project and detailing review', status: 'incomplete', statusLabel: 'Review',
      detail: 'Verify code edition/NA, cover basis, restraint, anchorage and circular-link shear applicability.' },
  ], message);
  const details = document.createElement('details');
  const title = document.createElement('summary'); title.textContent = 'All geometry and applicability checks (' + rows.length + ')';
  const body = document.createElement('div'); body.id = 'detailing-checks';
  renderColumnSummary(body, rows, 'Geometric checks and engineering review items');
  details.append(title, body); summary.append(details);
}
function draw() {
  drawSection(section, legend, state);
  drawInteraction(curve, rendered, state.chartGrid);
  byId('pm-caption').textContent = rendered
    ? 'Moment direction θ = ' + rendered.thetaDeg.toFixed(1) + '°, measured from +Mx toward +My. Demand is plotted at its resultant moment. Blue: resistance; amber: applied load.'
    : 'P compression positive. The diagram updates automatically with the section.';
}

function refresh() {
  for (const [key] of inputGroups.flatMap(([, fields]) => fields)) {
    const field = byId(key);
    if (field.type === 'checkbox') field.checked = Boolean(state[key]);
    else field.value = state[key];
  }
  renderLayers();
  for (const [id, key] of [['gridPmP', 'pmP'], ['gridPmM', 'pmM']]) byId(id).value = state.chartGrid?.[key] ?? '';
  draw();
}
for (const [id, key] of [['gridPmP', 'pmP'], ['gridPmM', 'pmM']]) byId(id).addEventListener('input', event => {
  const value = event.target.valueAsNumber;
  state.chartGrid = { ...state.chartGrid, [key]: Number.isFinite(value) && value > 0 ? value : null };
  draw();
});

function scheduleCalculation() {
  revision++;
  calculation = undefined;
  clearTimeout(debounce);
  if (pending) resetWorker('Inputs changed during calculation.');
  rendered = undefined;
  checks.replaceChildren();
  renderColumnSummary(summary, [], 'Updating checks…');
  try {
    validateInputs(state);
    renderChecks(null, 'Updating resistance checks…');
  } catch (error) {
    status.textContent = error.message;
    renderColumnSummary(summary, [], error.message);
    return;
  }
  status.textContent = 'Updating checks…';
  debounce = setTimeout(() => { void calculateCurrent().catch(() => {}); }, updateDelay);
}

form.addEventListener('input', event => {
  const input = event.target;
  if (!(input.id in defaults)) return;
  state[input.id] = input.type === 'checkbox' ? Number(input.checked) : input.valueAsNumber;
  scheduleCalculation();
  draw();
});

function resetWorker(message) {
  worker?.terminate();
  worker = undefined;
  if (pending) pending.reject(new Error(message));
}

function evaluate() {
  const values = { ...state };
  validateInputs(values);
  if (!worker) {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onerror = () => resetWorker('The worksheet worker stopped. Edit an input to retry.');
    worker.onmessage = ({ data }) => {
      if (pending?.id !== data.id) return;
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data);
    };
  }
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resetWorker('The worksheet did not finish. Edit an input to retry.'), 90000);
    const finish = callback => value => {
      clearTimeout(timer);
      pending = undefined;
      callback(value);
    };
    pending = { id, resolve: finish(resolve), reject: finish(reject) };
    worker.postMessage({ id, values });
  });
}

function display(result) {
  rendered = result;
  renderChecks(result);
  checks.replaceChildren();
  for (const [label, value, unit] of [
    ['Effective web width', result.width, ' mm'],
    ['Compression field cot θ', result.cot, ''],
    ['Conditional link shear resistance stress', result.linkStress, ' MPa'],
    ['Concrete strut stress', result.strutStress, ' MPa'],
  ]) {
    const name = document.createElement('dt');
    name.textContent = label;
    const cell = document.createElement('dd');
    cell.textContent = value === null ? '—' : value.toFixed(unit === ' mm' ? 1 : 3) + unit;
    checks.append(name, cell);
  }
  draw();
}

function calculateCurrent() {
  clearTimeout(debounce);
  if (calculation) return calculation;
  const start = revision;
  status.textContent = 'Calculating…';
  calculation = Promise.resolve().then(evaluate).then(({ result, document }) => {
    if (revision !== start) throw new Error('Inputs changed during calculation.');
    display(result);
    status.textContent = 'Calculation complete.';
    return document;
  }).catch(error => {
    if (revision === start) {
      status.textContent = error.message;
      renderChecks(null, error.message);
      calculation = undefined;
    }
    throw error;
  });
  return calculation;
}

form.addEventListener('submit', event => event.preventDefault());
const observer = new ResizeObserver(draw);
observer.observe(section);
observer.observe(curve);
refresh();
scheduleCalculation();

registerPage('rc-circular-column', {
  migrate: migrateSavedInputs,
  snapshot: () => {
    validateInputs(state);
    return structuredClone(state);
  },
  restore: inputs => {
    const next = restoreInputs(inputs);
    validateInputs(next);
    state = next;
    refresh();
    scheduleCalculation();
    draw();
  },
  report: async () => {
    const document = structuredClone(await calculateCurrent());
    const page = document.settings.pages;
    document.shapes.push({ id: 'circular-pm-chart', type: 'image', x: 76, y: page * 1171 + 110,
      props: { w: 642, h: Math.min(700, 642 * curve.clientHeight / curve.clientWidth), src: curve.toDataURL('image/png') } });
    document.shapes.push({ id: 'circular-pm-caption', type: 'text', x: 76, y: page * 1171 + 64,
      props: { w: 642, h: 36, html: 'P–M at governing angle — P compression positive; blue resistance; amber demand.', fontSize: 14, color: '#1f2a30' } });
    document.settings.pages++;
    return document;
  },
});
