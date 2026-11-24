import { registerPage } from '../../../apps/tool-page.mjs';
import { sections } from '../../../packages/assets/src/index.ts';
import { grid } from './bolt-group.mjs';
import { calculate } from './connection.mjs';
import { columnSupports, defaults, highSkew, jointForSupport, jointNames, supportNames, validateInputs } from './inputs.mjs';
import { beamFields, groups } from './fields.mjs';
import { drawingViews } from './drawing-view.mjs';
import { sectionBrowser } from './section-browser.mjs';
import { compareColumns } from './layout-study.mjs';
import { percent, report } from './report.mjs';
import { jointTemplatePicker } from './joint-template.mjs';
import { calculationTabs } from './calculation-tabs.mjs';
import './style.css';

const byId = id => document.getElementById(id);
const bySectionId = new Map(sections.map(s => [s.id, s]));
const drawings = drawingViews({
  plan: byId('connection-plan'), elevation: byId('connection-drawing'),
});
const controls = new Map();
const detailedCalculation = calculationTabs();
let state = { ...defaults };
let notchGroup;
const browseSection = sectionBrowser(sections, id => {
  state.section = id;
  setControls();
  refresh();
});
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
  if (title === 'Supported beam notch') {
    notchGroup = group;
    group.append(node('p', 'Use zero depths for a full-depth beam. Enter both depths for a double notch with a common length.'));
  }
  for (const [key, label, kind] of rows) {
    const row = node('label');
    const input = node(Array.isArray(kind) ? 'select' : 'input');
    input.id = key;
    row.append(node('span', label), input);
    if (Array.isArray(kind)) {
      for (const [value, name] of kind) input.add(new Option(name, value));
    } else if (kind === 'catalogue') {
      row.className = 'section-picker';
      input.readOnly = true;
    } else {
      input.type = kind === 'checkbox' ? kind : 'number';
      input.step = 'any';
    }
    controls.set(key, input);
    group.append(row);
    if (kind === 'catalogue') {
      const browse = node('button', 'Browse sections');
      browse.type = 'button';
      browse.setAttribute('aria-haspopup', 'dialog');
      browse.onclick = () => browseSection(state.section);
      group.append(browse);
    }
  }
  if (title === 'Bolt arrangement') group.append(editLayout, resetLayout);
  byId('fields').append(group);
}

function setControls() {
  const section = bySectionId.get(state.section);
  for (const [key, input] of controls) {
    if (key === 'section') input.value = state.section === 0 ? 'Custom I-section' : section?.name ?? '';
    else if (input.type === 'checkbox') input.checked = state[key];
    else if (key !== 'joint' && key !== 'support') input.value = section?.values[key] ?? state[key];
  }
  updateControls();
}

function updateControls() {
  const joint = jointForSupport(state.support);
  const jointControl = controls.get('joint');
  const supportControl = controls.get('support');
  jointControl.replaceChildren(...Object.entries(jointNames).map(([value, label]) => new Option(label, value)));
  if (joint === 'legacy') jointControl.add(new Option('Rigid support plate (saved design)', 'legacy'));
  jointControl.value = joint;
  supportControl.closest('label').hidden = joint !== 'beam-column';
  supportControl.replaceChildren(...columnSupports.map(value => new Option(supportNames[value], value)));
  supportControl.value = state.support;
  notchGroup.hidden = joint !== 'beam-beam';
  controls.get('notchLength').disabled = !state.notchTop && !state.notchBottom;
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
    for (const value of [option.columns, option.width.toFixed(1), option.eccentricity.toFixed(1)]) {
      row.append(node('td', value));
    }
    for (const ratio of [option.shear, option.web, option.plate]) {
      const cell = node('td', percent(ratio));
      cell.dataset.failure = String(ratio > 1);
      row.append(cell);
    }
    const detailing = node('td', option.details.length ? 'Review' : 'Screened');
    if (option.details.length) {
      detailing.dataset.failure = 'true';
      detailing.title = option.details.join(' ');
    }
    row.append(detailing);
    table.append(row);
  }
}

function refresh() {
  const status = byId('status');
  const table = byId('bolt-results');
  const checks = byId('checks');
  const details = byId('details');
  const summary = byId('geometry-summary');
  const warning = byId('detailing-warning');
  const planWarning = byId('plan-warning');
  warning.hidden = planWarning.hidden = true;
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
    status.textContent = result.status;
    status.dataset.failure = String(governing.ratio > 1 || result.details.length > 0);
    if (result.supportClearance < 0) {
      const overlap = (-result.supportClearance).toFixed(1) + ' mm';
      warning.textContent = 'Beam end overlaps the support face by ' + overlap + ' in plan.';
      planWarning.textContent = 'Overlap ' + overlap;
      warning.hidden = planWarning.hidden = false;
    }
    for (const item of result.details) {
      if (warning.hidden || !item.startsWith('The square beam end crosses')) details.append(node('li', item));
    }
    for (const item of result.openChecks) details.append(node('li', item));
    if (result.customLayout) details.append(node('li', 'Coordinate layout uses elastic bolt forces and shear. Bearing and pitch checks require a regular grid.'));
    for (const check of result.checks) {
      const { name, ratio, bolt, resistance, unit = 'kN' } = check;
      const row = node('tr');
      row.dataset.governing = String(check === governing);
      row.dataset.failure = String(ratio > 1);
      const label = node('th', name);
      label.scope = 'row';
      if (check === governing) label.append(node('small', 'Governing'));
      const value = node('td', percent(ratio));
      if (bolt || resistance != null) value.append(node('small', bolt ? 'Bolt ' + bolt : resistance.toFixed(1) + ' ' + unit));
      row.append(label, value);
      checks.append(row);
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
    drawings.render(section, state, result, { governing: governingBolt,
      forces: byId('show-forces').checked, dimensions: byId('show-dimensions').checked });
    renderStudy(section);
    detailedCalculation.render(state, section, result);
  } catch (error) {
    status.textContent = error.message;
    status.dataset.failure = 'true';
    drawings.clear();
    detailedCalculation.clear();
  }
}

byId('connection-inputs').addEventListener('submit', event => event.preventDefault());
byId('connection-inputs').addEventListener('input', ({ target }) => {
  const key = target.id;
  if (!controls.has(key) || key === 'section') return;
  if (['columns', 'rows'].includes(key) && Number(target.value) !== state[key]) state.coordinates = null;
  if (key === 'joint') state.support = target.value === 'beam-beam' ? 'beam-web' : 'column-flange';
  else if (target.type === 'checkbox') state[key] = target.checked;
  else if (target.type === 'number') state[key] = target.valueAsNumber;
  else state[key] = typeof defaults[key] === 'number' ? Number(target.value) : target.value;
  updateControls();
  refresh();
});
for (const key of ['show-forces', 'show-dimensions']) byId(key).addEventListener('change', refresh);
byId('layout-study').addEventListener('toggle', refresh);
for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', 0.8]]) byId(id).onclick = () => {
  drawings.zoom(factor);
};
byId('fit').onclick = () => drawings.fit();
byId('preset').onclick = () => {
  state = { ...state, ...highSkew, support: state.support };
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

function openEditor(inputs) {
  state = { ...defaults, ...inputs };
  templates.close();
  setControls();
  refresh();
}

const templates = jointTemplatePicker(support => {
  openEditor({ support });
  byId('drawing-title').focus();
});
if (!new URLSearchParams(window.location.search).get('design')) templates.open();

registerPage('fin-plate', {
  snapshot: () => {
    if (!templates.editing) throw new Error('Choose and open a joint template first.');
    validateInputs(state, beam());
    return { ...state };
  },
  reset: () => templates.open(),
  restore: openEditor,
  report: () => {
    if (!templates.editing) throw new Error('Choose and open a joint template first.');
    const section = beam();
    return report(state, section, calculate(state, section));
  },
});
