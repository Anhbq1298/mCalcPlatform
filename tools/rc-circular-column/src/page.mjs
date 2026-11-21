import { renderColumnSummary, resistanceRow } from '../../../apps/column-summary.mjs';
import '../../../apps/column-summary.css';
import { registerPage } from '../../../apps/tool-page.mjs';
import { defaults, inputGroups, newDefaults, restoreInputs, validateInputs } from './inputs.mjs';
import { mountLayers } from './layer-controls.mjs';
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
let state = newDefaults();
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
  if (title.endsWith('cage')) group.dataset.legacyCage = title === 'Inner cage' ? 'inner' : 'outer';
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
  form.insertBefore(group, title === 'Design actions' ? null : byId('layer-inputs'));
}

const refreshLayers = mountLayers(byId('layer-inputs'), () => state, () => {
  scheduleCalculation();
  draw();
});

function refreshTransverse() {
  const links = state.transverse === 'links';
  for (const group of form.querySelectorAll('[data-legacy-cage]')) {
    group.hidden = links || (group.dataset.legacyCage === 'inner' && state.cages !== 2);
  }
  byId('cages').closest('label').hidden = links;
  byId('layer-inputs').hidden = !links;
  byId('legacy-links').hidden = links;
  byId('aggregate').value = state.aggregate;
  byId('section-title').textContent = links ? 'Section and closed links' : 'Section and spirals';
  byId('spiralSteel').previousElementSibling.textContent = links ? 'Link steel fyk (MPa)' : 'Spiral steel fyk (MPa)';
  byId('classA').previousElementSibling.textContent = links ? 'Class A links' : 'Class A spirals';
  byId('cover').previousElementSibling.textContent = links ? 'Cover to outer link (mm)' : 'Cover to spiral (mm)';
  byId('shear-basis').textContent = links ? 'Shear credits the outer closed link. Verify anchorage and end zones.' : '';
}

byId('convert-links').addEventListener('click', () => {
  state.layers = Array.from({ length: state.cages }, (_, index) => {
    const i = index + 1;
    return { count: Math.max(4, state['count' + i]), bar: state['bar' + i], link: state['spiral' + i], spacing: state['pitch' + i] };
  });
  state.transverse = 'links';
  scheduleCalculation();
  refresh();
});

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
  refreshTransverse();
  refreshLayers();
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
  if (!(input.id in defaults) && input.id !== 'aggregate') return;
  state[input.id] = input.type === 'checkbox' ? Number(input.checked) : input.valueAsNumber;
  scheduleCalculation();
  if (input.id === 'cages') refreshTransverse();
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
    ['Link shear resistance stress', result.linkStress, ' MPa'],
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
    return structuredClone(state);
  },
  migrate: (inputs, from) => {
    if (from !== 1) throw new Error('Unsupported circular column input version.');
    return restoreInputs(inputs);
  },
  restore: inputs => {
    const next = restoreInputs(inputs);
    validateInputs(next);
    state = next;
    refresh();
    scheduleCalculation();
    draw();
  },
  report: async () => structuredClone(await calculateCurrent()),
});
