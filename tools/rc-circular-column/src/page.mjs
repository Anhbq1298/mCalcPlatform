import { renderColumnSummary, resistanceRow } from '../../../apps/column-summary.mjs';
import '../../../apps/column-summary.css';
import { registerPage } from '../../../apps/tool-page.mjs';
import { defaults, inputGroups, validateInputs } from './inputs.mjs';
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
let state = { ...defaults };
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
  if (title === 'Inner cage') group.dataset.innerCage = '';
  for (const [id, label, , , , min, max, step] of fields) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.type = id === 'classA' ? 'checkbox' : 'number';
    input.step = step ?? 'any';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    row.append(name, input);
    group.append(row);
  }
  form.append(group);
}

function draw() {
  drawSection(section, legend, state);
  drawInteraction(curve, rendered);
}

function refresh() {
  for (const [key, value] of Object.entries(defaults)) {
    const field = byId(key);
    if (key === 'classA') field.checked = Boolean(state[key]);
    else field.value = state[key] ?? value;
  }
  form.querySelector('[data-inner-cage]').hidden = state.cages !== 2;
  draw();
}

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
  form.querySelector('[data-inner-cage]').hidden = state.cages !== 2;
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
  renderColumnSummary(summary, [
    resistanceRow('P–M utilization', result.combined),
    resistanceRow('Shear utilization', result.shear),
    ...result.detailing,
  ]);
  checks.replaceChildren();
  for (const [label, value, unit] of [
    ['Effective web width', result.width, ' mm'],
    ['Compression field cot θ', result.cot, ''],
    ['Spiral shear resistance stress', result.linkStress, ' MPa'],
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
    return { ...state };
  },
  restore: inputs => {
    const next = { ...defaults, ...inputs };
    validateInputs(next);
    state = next;
    refresh();
    scheduleCalculation();
    draw();
  },
  report: async () => structuredClone(await calculateCurrent()),
});
