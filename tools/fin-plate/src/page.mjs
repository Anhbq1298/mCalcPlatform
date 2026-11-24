import { registerPage } from '../../../apps/tool-page.mjs';
import { sections } from '../../../packages/assets/src/index.ts';
import { grid } from './bolt-group.mjs';
import { calculate } from './connection.mjs';
import { defaults, highSkew, validateInputs } from './inputs.mjs';
import { beamFields, groups } from './fields.mjs';
import { draw } from './drawing.mjs';
import { compareColumns } from './layout-study.mjs';
import { percent, report } from './report.mjs';
import './style.css';

const byId = id => document.getElementById(id);
const catalogue = sections.filter(s => ['UB', 'UC', 'IPE', 'HEA', 'HEB'].includes(s.family));
const bySectionId = new Map(catalogue.map(s => [s.id, s]));
const normalizeSection = value => value.toLowerCase().replaceAll('×', 'x').replace(/\s+/g, '');
const bySectionName = new Map(catalogue.map(s => [normalizeSection(s.name), s.id]));
const drawing = byId('connection-drawing');
const controls = new Map();
let state = { ...defaults };
let viewBox;
let zoom = 1;
let pan = [0, 0];
let drag;
const editLayout = node('button', 'Edit bolt coordinates');
const resetLayout = node('button', 'Use regular grid');
editLayout.type = resetLayout.type = 'button';

function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function beam() {
  if (state.section === 0) return { ...Object.fromEntries(beamFields.map(([key]) => [key, state[key]])), name: 'Custom I-section' };
  const section = bySectionId.get(state.section);
  if (!section) throw new RangeError('Choose a section from the catalogue or enter Custom I-section.');
  return { ...section.values, name: section.name };
}

for (const [title, rows] of groups) {
  const group = node('details');
  group.open = !['Fin plate and clearance', 'Weld and support resistance', 'Skew and eccentricity'].includes(title);
  group.append(node('summary', title));
  for (const [key, label, kind] of rows) {
    const row = node('label');
    const input = node(Array.isArray(kind) ? 'select' : 'input');
    input.id = key;
    row.append(node('span', label), input);
    if (Array.isArray(kind)) {
      for (const [value, name] of kind) input.add(new Option(name, value));
    } else if (kind === 'catalogue') {
      row.className = 'section-picker';
      const choices = node('datalist');
      choices.id = 'section-options';
      for (const name of ['Custom I-section', ...catalogue.map(s => s.name)]) choices.append(new Option(name));
      input.setAttribute('list', choices.id);
      input.autocomplete = 'off';
      row.append(choices);
    } else {
      input.type = kind === 'checkbox' ? kind : 'number';
      input.step = 'any';
    }
    controls.set(key, input);
    group.append(row);
  }
  if (title === 'Bolt arrangement') group.append(editLayout, resetLayout);
  byId('fields').append(group);
}

function applyViewBox() {
  const [x, y, w, h] = viewBox;
  drawing.setAttribute('viewBox', [x + (w - w / zoom) / 2 + pan[0], y + (h - h / zoom) / 2 + pan[1], w / zoom, h / zoom].join(' '));
}

function setControls() {
  const section = bySectionId.get(state.section);
  for (const [key, input] of controls) {
    if (key === 'section') input.value = state.section === 0 ? 'Custom I-section' : section?.name ?? '';
    else if (input.type === 'checkbox') input.checked = state[key];
    else input.value = section?.values[key] ?? state[key];
  }
  updateControls();
}

function updateControls() {
  for (const [key] of beamFields) {
    const input = controls.get(key);
    input.readOnly = state.section !== 0;
    if (input.readOnly) input.value = bySectionId.get(state.section)?.values[key] ?? '';
  }
  controls.get('columns').disabled = Boolean(state.coordinates);
  controls.get('rows').disabled = Boolean(state.coordinates);
  controls.get('gauge').disabled = state.columns < 2 || Boolean(state.coordinates);
  controls.get('secondGauge').disabled = state.columns < 3 || Boolean(state.coordinates);
  controls.get('eccentricity').disabled = state.eccentricityMode === 'geometry';
  resetLayout.hidden = !state.coordinates;
}

function renderStudy(section) {
  const table = byId('layout-results');
  table.replaceChildren();
  if (!byId('layout-study').open) return;
  for (const option of compareColumns(state, section)) {
    const row = node('tr');
    row.dataset.governing = String(option.columns === state.columns);
    for (const value of [option.columns, option.width.toFixed(1), option.eccentricity.toFixed(1),
      percent(option.shear), percent(option.web), percent(option.plate), option.details.length ? 'Review' : 'Screened']) {
      row.append(node('td', value));
    }
    if (option.details.length) row.lastElementChild.title = option.details.join(' ');
    table.append(row);
  }
}

function refresh() {
  const status = byId('status');
  const table = byId('bolt-results');
  const checks = byId('checks');
  const details = byId('details');
  const summary = byId('geometry-summary');
  table.replaceChildren();
  checks.replaceChildren();
  details.replaceChildren();
  summary.textContent = '';
  byId('layout-results').replaceChildren();
  try {
    const section = beam();
    const result = calculate(state, section);
    const governing = result.checks.reduce((worst, check) => check.ratio > worst.ratio ? check : worst);
    const governingBolt = result.checks.filter(check => check.bolt)
      .reduce((worst, check) => check.ratio > worst.ratio ? check : worst).bolt;
    status.textContent = result.status + ' · ' + governing.name + ' ' + percent(governing.ratio);
    status.dataset.failure = String(governing.ratio > 1 || result.details.length > 0);
    for (const item of result.details) details.append(node('li', item));
    if (result.customLayout) details.append(node('li', 'Coordinate layout uses elastic bolt forces and shear. Bearing and pitch checks require a regular grid.'));
    for (const { name, ratio, bolt, resistance } of result.checks) {
      const value = node('dd', percent(ratio) + (bolt ? ' · bolt ' + bolt : '') + (resistance ? ' · ' + resistance.toFixed(1) + ' kN' : ''));
      value.dataset.failure = String(ratio > 1);
      checks.append(node('dt', name), value);
    }
    for (const b of result.group.bolts) {
      const row = node('tr');
      row.dataset.governing = String(b.id === governingBolt);
      for (const item of [b.id, b.fx.toFixed(2), b.fy.toFixed(2), b.force.toFixed(2), percent(b.shear),
        b.web ? percent(b.web.utilization) : '—', b.plate ? percent(b.plate.utilization) : '—']) row.append(node('td', item));
      table.append(row);
    }
    summary.textContent = 'Axis eccentricity ' + result.z.toFixed(1) + ' mm · Normal projection ' + result.normal.toFixed(1)
      + ' mm · Bolt-group moment ' + (result.moment / 1000).toFixed(2) + ' kNm · Hole Ø' + result.bolt.hole + ' mm'
      + ' · Normal end clearance ' + result.supportClearance.toFixed(1) + ' mm';
    viewBox = draw(drawing, section, state, result, { view: byId('view').value, governing: governingBolt,
      forces: byId('show-forces').checked, dimensions: byId('show-dimensions').checked });
    applyViewBox();
    renderStudy(section);
  } catch (error) {
    status.textContent = error.message;
    status.dataset.failure = 'true';
    drawing.replaceChildren();
    viewBox = undefined;
  }
}

byId('connection-inputs').addEventListener('submit', event => event.preventDefault());
byId('connection-inputs').addEventListener('input', ({ target }) => {
  const key = target.id;
  if (!controls.has(key)) return;
  if (['columns', 'rows'].includes(key) && Number(target.value) !== state[key]) state.coordinates = null;
  if (key === 'section') {
    const value = normalizeSection(target.value);
    state.section = value === 'customi-section' ? 0 : bySectionName.get(value);
  } else if (target.type === 'checkbox') state[key] = target.checked;
  else if (target.type === 'number') state[key] = target.valueAsNumber;
  else state[key] = typeof defaults[key] === 'number' ? Number(target.value) : target.value;
  updateControls();
  refresh();
});
for (const key of ['show-forces', 'show-dimensions']) byId(key).addEventListener('change', refresh);
byId('layout-study').addEventListener('toggle', refresh);
for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', 0.8]]) byId(id).onclick = () => {
  if (!viewBox) return;
  zoom = Math.max(0.5, Math.min(8, zoom * factor));
  applyViewBox();
};
for (const event of ['view', 'fit']) byId(event).addEventListener(event === 'fit' ? 'click' : 'change', () => {
  zoom = 1;
  pan = [0, 0];
  refresh();
});
drawing.onpointerdown = event => {
  if (!viewBox) return;
  const scale = drawing.getScreenCTM()?.a;
  if (!scale) return;
  drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, pan, scale };
  drawing.setPointerCapture(event.pointerId);
};
drawing.onpointermove = event => {
  if (!viewBox || drag?.pointer !== event.pointerId) return;
  pan = [drag.pan[0] - (event.clientX - drag.x) / drag.scale, drag.pan[1] - (event.clientY - drag.y) / drag.scale];
  applyViewBox();
};
drawing.onlostpointercapture = () => { drag = undefined; };
byId('preset').onclick = () => {
  state = { ...state, ...highSkew };
  setControls();
  refresh();
};
byId('help-open').onclick = () => byId('help').showModal();
resetLayout.onclick = () => { state.coordinates = null; updateControls(); refresh(); };
const editor = byId('bolt-editor');
editLayout.onclick = () => {
  try { validateInputs(state, beam()); }
  catch (error) { byId('status').textContent = error.message; return; }
  const rows = (state.coordinates ?? grid(state)).map(point => {
    const row = node('tr');
    row.append(node('td', point.id));
    for (const axis of ['x', 'y']) {
      const input = node('input');
      Object.assign(input, { type: 'number', step: 'any', value: point[axis], required: true });
      input.setAttribute('aria-label', 'Bolt ' + point.id + ' ' + axis.toUpperCase());
      const cell = node('td');
      cell.append(input);
      row.append(cell);
    }
    return row;
  });
  byId('bolt-coordinates').replaceChildren(...rows);
  editor.returnValue = 'cancel';
  editor.showModal();
};
editor.addEventListener('close', () => {
  if (editor.returnValue !== 'apply') return;
  state.coordinates = [...byId('bolt-coordinates').rows].map((row, index) => {
    const [x, y] = [...row.querySelectorAll('input')].map(input => input.valueAsNumber);
    return { ...state.coordinates?.[index], id: index + 1, x, y };
  });
  updateControls();
  refresh();
});

setControls();
refresh();
registerPage('fin-plate', {
  snapshot: () => {
    validateInputs(state, beam());
    return { ...state };
  },
  restore: inputs => {
    state = { ...defaults, ...inputs };
    setControls();
    refresh();
  },
  report: () => {
    const section = beam();
    return report(state, section, calculate(state, section));
  },
});
