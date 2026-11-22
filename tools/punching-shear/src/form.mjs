// Input form built from field definitions, following the mConcreteCircCol layout (fieldset, legend,
// label > span + control). Values are read from and written to a nested state object by path.
// Labels are plain text with $…$ LaTeX spans rendered as MathML.
import { ARRANGEMENTS } from './arrangement.mjs';
import { LINK_DIAMETERS } from './inputs.mjs';
import { SUMMARY } from './form-summary.mjs';
import { htmlSubscripts } from './subscript.mjs';
import { labelHtml, labelText } from './tex.mjs';

const get = (state, path) => path.split('.').reduce((value, key) => value?.[key], state);
function set(state, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((value, key) => value[key], state)[last] = value;
}

const yes = () => true;
const option = (value, label) => ({ value, label });

export const GROUPS = [
  ['Design basis', [
    ['code.edition', 'Code edition', 'select', [option('EN 1992-1-1:2004 + AC:2010 + A1:2014', 'EN 1992-1-1:2004 + AC:2010 + A1:2014')]],
    ['code.profile', 'Parameter set', 'select', [option('cen', 'CEN recommended values'), option('sg', 'Singapore National Annex'), option('uk', 'UK National Annex')]],
    ['code.naConfirmed', 'UK NA values checked against the NA text', 'checkbox', null, s => s.code.profile === 'uk'],
    ['column.position', 'Column position', 'select', [option('internal', 'Internal'), option('edge', 'Edge (face flush with slab edge)'), option('corner', 'Corner (faces flush with two edges)')]],
  ]],
  ['Column', [
    ['column.shape', 'Shape', 'select', [option('rectangular', 'Rectangular'), option('circular', 'Circular')]],
    ['column.cx', '$c_x$ (mm)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.cy', '$c_y$ (mm)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.diameter', 'Diameter $D$ (mm)', 'number', null, s => s.column.shape === 'circular'],
    ['column.rotation', 'Rotation $\\theta$ (°)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.x', 'Centre $X$ (mm)', 'number'],
    ['column.y', 'Centre $Y$ (mm)', 'number'],
  ]],
  ['Slab', [
    ['slab.h', 'Thickness $h$ (mm)', 'number'],
    ['slab.depthMode', 'Effective depth', 'select', [option('explicit', 'Enter dx, dy'), option('bars', 'From cover and bars')]],
    ['slab.dx', '$d_x$ (mm)', 'number', null, s => s.slab.depthMode === 'explicit'],
    ['slab.dy', '$d_y$ (mm)', 'number', null, s => s.slab.depthMode === 'explicit'],
    ['slab.cover', 'Top and bottom cover $c$ (mm)', 'number'],
    ['slab.xMin', 'Slab edge $X_{min}$ (mm)', 'number'],
    ['slab.xMax', 'Slab edge $X_{max}$ (mm)', 'number'],
    ['slab.yMin', 'Slab edge $Y_{min}$ (mm)', 'number'],
    ['slab.yMax', 'Slab edge $Y_{max}$ (mm)', 'number'],
  ]],
  ['Drop panel / column head', [
    ['head.enabled', 'Include a drop panel (concentric)', 'checkbox'],
    ['head.shape', 'Drop shape', 'select', [option('rectangular', 'Rectangular'), option('circular', 'Circular')], s => s.head.enabled],
    ['head.lx', 'Drop $l_x$ (mm)', 'number', null, s => s.head.enabled && s.head.shape === 'rectangular'],
    ['head.ly', 'Drop $l_y$ (mm)', 'number', null, s => s.head.enabled && s.head.shape === 'rectangular'],
    ['head.diameter', 'Drop diameter $D_H$ (mm)', 'number', null, s => s.head.enabled && s.head.shape === 'circular'],
    ['head.thickness', 'Total thickness $h_{tot}$ (mm)', 'number', null, s => s.head.enabled],
  ]],
  ['Openings', []],
  ['Materials', [
    ['materials.fck', 'Concrete $f_{ck}$ (MPa)', 'number'],
    ['materials.fyk', 'Link steel $f_{yk}$ (MPa)', 'number'],
  ]],
  ['In-plane normal stress', [
    ['prestress.sigmaX', '$\\sigma_{cx}$ (MPa, compression +)', 'number'],
    ['prestress.sigmaY', '$\\sigma_{cy}$ (MPa, compression +)', 'number'],
  ]],
  ['Top flexural reinforcement', [
    ['flexure.phiX', 'Bar $\\phi_x$ (mm)', 'number'],
    ['flexure.sX', 'Spacing $s_x$ (mm)', 'number'],
    ['flexure.phiY', 'Bar $\\phi_y$ (mm)', 'number'],
    ['flexure.sY', 'Spacing $s_y$ (mm)', 'number'],
    ['flexure.outer', 'Outer layer', 'select', [option('x', 'Bars along x'), option('y', 'Bars along y')], s => s.slab.depthMode === 'bars'],
  ]],
  ['Design actions', []],
  ['Load increment factor $\\beta$', [
    ['beta.method', 'Method', 'select', [option('simplified', 'Simplified, β = 1.15 / 1.4 / 1.5'), option('moment', 'From moments (Eq. 6.39, 6.42, 6.43)'), option('user', 'User-defined')]],
    ['beta.confirmed', 'Braced, spans differ ≤ 25 % (§6.4.3(6))', 'checkbox', null, s => s.beta.method === 'simplified'],
    ['beta.userValue', '$\\beta$ (user value)', 'number', null, s => s.beta.method === 'user'],
  ]],
  ['Punching reinforcement', [
    ['reinforcement.mode', 'Links', 'select', [option('auto', 'Auto arrangement'), option('provided', 'Custom layout (table)')]],
    ['reinforcement.diameter', 'Bar Ø (mm)', 'select', LINK_DIAMETERS.map(value => option(value, String(value))), s => s.reinforcement.mode === 'auto'],
    ['reinforcement.shape', 'Link shape', 'select', [option('single', 'Single-leg'), option('double', 'Two-leg')], s => s.reinforcement.mode === 'auto'],
    ['reinforcement.arrangement', 'Arrangement', 'select', Object.entries(ARRANGEMENTS).map(([value, label]) => option(value, label)), s => s.reinforcement.mode === 'auto'],
    ['reinforcement.sr', 'Radial spacing $s_r$ (mm)', 'number', null, s => s.reinforcement.mode === 'auto'],
    ['reinforcement.st', 'Grid spacing $s_t$ (mm)', 'number', null, s => s.reinforcement.mode === 'auto' && s.reinforcement.arrangement === 'grid'],
    ['@layers', '', 'anchor'],
    ['', 'Link detailing', 'heading'],
    ['reinforcement.anchorage.type', 'Anchorage', 'select', [option('hook', 'Hook (135° or 180°)'), option('bend', 'Bend (90°)')]],
    ['reinforcement.anchorage.mandrelFactor', 'Mandrel Ø / bar Ø', 'number'],
    ['reinforcement.anchorage.extension', 'Straight extension (mm)', 'number'],
    ['reinforcement.legGap', 'Two-leg link width (mm)', 'number', null, s => (s.reinforcement.mode === 'auto' ? s.reinforcement.shape === 'double' : (s.reinforcement.groups || []).some(group => group.shape === 'double'))],  ]],
];

export function buildForm(form, anchors, getState, onChange) {
  const rows = [];
  const cards = [];
  for (const [title, fields] of GROUPS) {
    // Each group is a card: a one-line summary when closed; one card open at a time unless all are shown.
    const group = document.createElement('details');
    group.className = 'input-card';
    const legend = document.createElement('summary');
    legend.innerHTML = `<span class="card-title">${labelHtml(title)}</span><span class="card-summary"></span>`;
    const body = document.createElement('div');
    body.className = 'card-body';
    group.append(legend, body);
    cards.push({ group, title, text: legend.querySelector('.card-summary') });
    group.addEventListener('toggle', () => {
      if (group.open && !form.classList.contains('all-open')) for (const other of cards) if (other.group !== group) other.group.open = false;
    });
    let placed = false;
    for (const [path, label, type, options, visible = yes] of fields) {
      if (type === 'anchor') {
        // A host element (e.g. the link arrangement table) placed among the fields.
        const anchor = anchors[labelText(title)] ?? anchors[title];
        if (anchor) { anchor.classList.add('wide'); body.append(anchor); placed = true; }
        continue;
      }
      if (type === 'heading') {
        const head = document.createElement('p');
        head.className = 'card-subhead wide';
        head.textContent = label;
        body.append(head);
        continue;
      }
      const row = document.createElement('label');
      const name = document.createElement('span');
      name.innerHTML = labelHtml(label);
      let control;
      if (type === 'select') {
        control = document.createElement('select');
        for (const entry of options) control.append(new Option(entry.label, String(entry.value)));
      } else {
        control = document.createElement('input');
        control.type = type;
        if (type === 'number') control.step = 'any';
      }
      control.dataset.path = path;
      control.setAttribute('aria-label', labelText(label));
      row.append(name, control);
      if (type === 'checkbox' || path === 'reinforcement.mode' || type === 'select' && options.some(entry => entry.label.length > 18)) row.classList.add('wide');
      body.append(row);
      rows.push({ row, control, path, type, options, visible });
    }
    const anchor = anchors[labelText(title)] ?? anchors[title];
    if (anchor && !placed) { anchor.classList.add('wide'); body.append(anchor); }
    form.append(group);
  }
  form.addEventListener('input', event => {
    const entry = rows.find(item => item.control === event.target);
    if (!entry) return;
    const state = getState();
    let value;
    if (entry.type === 'checkbox') value = entry.control.checked;
    else if (entry.type === 'number') value = entry.control.valueAsNumber;
    else value = typeof entry.options[0].value === 'number' ? Number(entry.control.value) : entry.control.value;
    set(state, entry.path, value);
    refresh();
    onChange(entry.path);
  });
  function refresh() {
    const state = getState();
    for (const card of cards) {
      let text = '';
      try { text = SUMMARY[card.title]?.(state) ?? ''; } catch { text = ''; }
      card.text.textContent = text;
      htmlSubscripts(card.text);
    }
    for (const entry of rows) {
      entry.row.hidden = !entry.visible(state);
      const value = get(state, entry.path);
      if (entry.type === 'checkbox') entry.control.checked = Boolean(value);
      else if (document.activeElement !== entry.control) entry.control.value = value ?? '';
    }
  }
  refresh.showAll = on => {
    form.classList.toggle('all-open', on);
    for (const card of cards) card.group.open = on;
  };
  refresh.open = title => { for (const card of cards) card.group.open = card.title === title || form.classList.contains('all-open'); };
  return refresh;
}
