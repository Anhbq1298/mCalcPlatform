import { renderColumnSummary } from '../../../apps/column-summary.mjs';
import '../../../apps/column-summary.css';
import { registerPage } from '../../../apps/tool-page.mjs';
import { migrateInputs, newDefaults, validateInputs, visibleGroups } from './inputs.mjs';
import { mountLayers } from './layer-controls.mjs';
import { drawInteraction } from './drawing.mjs';
import { drawSection } from './cad-drawing.mjs';
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
const plotGridP = byId('plot-grid-p');
const plotGridM = byId('plot-grid-m');
const plotCaption = byId('interaction-caption');
for (const input of [plotGridP, plotGridM]) input.addEventListener('input', draw);
const summary = byId('column-check-summary');
let state = newDefaults();
let rendered;
let worker;
let pending;
let revision = 0;
let requestId = 0;
let debounce;
let calculation;
const updateDelay = 250;

for (const [title, fields] of visibleGroups) {
  const group = document.createElement('fieldset');
  const heading = document.createElement('legend');
  heading.textContent = title;
  group.append(heading);
  for (const [id, label, , , , min, max, step] of fields) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.step = step ?? 'any';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    row.append(name, input);
    group.append(row);
  }
  form.insertBefore(group, title === 'Design actions' ? null : byId('layer-inputs'));
}

const refreshLayers = mountLayers(form, () => state, () => {
  scheduleCalculation();
  draw();
});
const optionalFields = new Set(['effectiveLengthX', 'effectiveLengthY']);
const scalarFields = [...visibleGroups.flatMap(([, group]) => group.map(([key]) => key)),
  'aggregate', 'height', 'creepRatio', ...optionalFields, 'secondOrderIncluded'];

function draw() {
  let geometry;
  try { geometry = validateInputs(state); } catch { /* Temporarily invalid input clears CAD views. */ }
  drawSection(section, legend, state, geometry);
  const [mx, my] = rendered?.moments ?? [0, 0];
  const angle = mx || my ? (Math.atan2(my, mx) * 180 / Math.PI + 360) % 360 : null;
  drawInteraction(curve, rendered, { gridP: plotGridP.valueAsNumber, gridM: plotGridM.valueAsNumber, angle });
  plotCaption.textContent = !rendered ? '' : angle == null
    ? 'Pure axial demand. Gold marker: design demand.'
    : 'Moment direction θ = ' + angle.toFixed(1) + '°, measured from +Mx toward +My. Gold marker: design demand.';
}

function refresh() {
  for (const key of scalarFields) {
    const field = byId(key);
    if (field.type === 'checkbox') field.checked = Boolean(state[key]);
    else field.value = state[key] ?? '';
  }
  refreshLayers();
  draw();
}

function scheduleCalculation() {
  revision++;
  calculation = undefined;
  clearTimeout(debounce);
  if (pending) resetWorker('Inputs changed during calculation.');
  rendered = undefined;
  renderColumnSummary(summary, [], 'Updating checks…');
  try {
    validateInputs(state);
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
  if (!scalarFields.includes(input.id)) return;
  state[input.id] = input.type === 'checkbox' ? Number(input.checked)
    : optionalFields.has(input.id) && !input.value && !input.validity.badInput ? null : input.valueAsNumber;
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
  renderColumnSummary(summary, result.rows);
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
      renderColumnSummary(summary, [], error.message);
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
  snapshot: () => {
    validateInputs(state);
    return structuredClone(state);
  },
  migrate: migrateInputs,
  restore: inputs => {
    const next = { ...newDefaults(), ...inputs };
    validateInputs(next);
    state = next;
    refresh();
    scheduleCalculation();
    draw();
  },
  report: async () => structuredClone(await calculateCurrent()),
});
