// Input form built from field definitions, following the mConcreteCircCol layout (fieldset, legend,
// label > span + control). Values are read from and written to a nested state object by path.
// Labels are plain text with $…$ LaTeX spans rendered as MathML.
import { LINK_DIAMETERS } from './inputs.mjs';
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
    ['code.profile', 'Parameter set', 'select', [option('cen', 'CEN recommended values'), option('sg', 'Singapore National Annex (confirm values)'), option('uk', 'UK National Annex (confirm values)')]],
    ['code.naConfirmed', 'NA values confirmed against the NA text', 'checkbox', null, s => s.code.profile !== 'cen'],
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
    ['head.depth', 'Depth below slab $h_H$ (mm)', 'number', null, s => s.head.enabled],
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
    ['flexure.areaMode', 'Area input', 'select', [option('explicit', 'Area per metre'), option('bars', 'Bars and spacing')]],
    ['flexure.asx', '$A_{s,x}$ (mm²/m)', 'number', null, s => s.flexure.areaMode === 'explicit'],
    ['flexure.asy', '$A_{s,y}$ (mm²/m)', 'number', null, s => s.flexure.areaMode === 'explicit'],
    ['flexure.phiX', 'Bar $\\phi_x$ (mm)', 'number', null, s => s.flexure.areaMode === 'bars' || s.slab.depthMode === 'bars'],
    ['flexure.sX', 'Spacing $s_x$ (mm)', 'number', null, s => s.flexure.areaMode === 'bars'],
    ['flexure.phiY', 'Bar $\\phi_y$ (mm)', 'number', null, s => s.flexure.areaMode === 'bars' || s.slab.depthMode === 'bars'],
    ['flexure.sY', 'Spacing $s_y$ (mm)', 'number', null, s => s.flexure.areaMode === 'bars'],
    ['flexure.outer', 'Outer layer', 'select', [option('x', 'Bars along x'), option('y', 'Bars along y')], s => s.slab.depthMode === 'bars'],
  ]],
  ['Design actions', []],
  ['Load increment factor $\\beta$', [
    ['beta.method', 'Method', 'select', [option('simplified', 'Simplified, β = 1.15 / 1.4 / 1.5'), option('moment', 'From moments (Eq. 6.39, 6.42, 6.43)'), option('user', 'User-defined')]],
    ['beta.confirmed', 'Braced, spans differ ≤ 25 % (§6.4.3(6))', 'checkbox', null, s => s.beta.method === 'simplified'],
    ['beta.userValue', '$\\beta$ (user value)', 'number', null, s => s.beta.method === 'user'],
  ]],
  ['Punching reinforcement', [
    ['reinforcement.mode', 'Mode', 'select', [option('auto', 'Auto design'), option('provided', 'Check provided')]],
    ['reinforcement.diameter', 'Link $\\phi$ (mm)', 'select', LINK_DIAMETERS.map(value => option(value, String(value))), s => s.reinforcement.mode === 'auto'],
    ['reinforcement.shape', 'Link shape', 'select', [option('single', 'Single-leg link'), option('double', 'Two-leg link')], s => s.reinforcement.mode === 'auto'],
    ['reinforcement.legGap', 'Two-leg link width $b_l$ (mm)', 'number'],
    ['reinforcement.anchorage.type', 'Link anchorage', 'select', [option('hook', 'Hook (135° or 180°)'), option('bend', 'Bend (90°)')]],
    ['reinforcement.anchorage.mandrelFactor', 'Mandrel diameter $\\phi_m/\\phi$', 'number'],
    ['reinforcement.anchorage.extension', 'Straight extension $l_{ext}$ (mm)', 'number'],
    ['reinforcement.anchorage.engaged', 'Links enclose top and bottom flexural bars', 'checkbox'],
  ]],
];

export function buildForm(form, anchors, getState, onChange) {
  const rows = [];
  for (const [title, fields] of GROUPS) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.innerHTML = labelHtml(title);
    group.append(legend);
    for (const [path, label, type, options, visible = yes] of fields) {
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
      group.append(row);
      rows.push({ row, control, path, type, options, visible });
    }
    const anchor = anchors[labelText(title)] ?? anchors[title];
    if (anchor) group.append(anchor);
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
    for (const entry of rows) {
      entry.row.hidden = !entry.visible(state);
      const value = get(state, entry.path);
      if (entry.type === 'checkbox') entry.control.checked = Boolean(value);
      else if (document.activeElement !== entry.control) entry.control.value = value ?? '';
    }
  }
  return refresh;
}
