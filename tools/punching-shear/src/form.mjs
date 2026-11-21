// Input form built from field definitions, following the mConcreteCircCol layout (fieldset, legend,
// label > span + control). Values are read from and written to a nested state object by path.

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
    ['code.profile', 'Parameter set', 'select', [option('cen', 'CEN recommended values')]],
    ['column.position', 'Column position', 'select', [option('internal', 'Internal'), option('edge', 'Edge (not supported)'), option('corner', 'Corner (not supported)')]],
  ]],
  ['Column', [
    ['column.shape', 'Shape', 'select', [option('rectangular', 'Rectangular'), option('circular', 'Circular')]],
    ['column.cx', 'c_x (mm)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.cy', 'c_y (mm)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.diameter', 'Diameter D (mm)', 'number', null, s => s.column.shape === 'circular'],
    ['column.rotation', 'Rotation (°)', 'number', null, s => s.column.shape === 'rectangular'],
    ['column.x', 'Centre X (mm)', 'number'],
    ['column.y', 'Centre Y (mm)', 'number'],
  ]],
  ['Slab', [
    ['slab.h', 'Thickness h (mm)', 'number'],
    ['slab.depthMode', 'Effective depth', 'select', [option('explicit', 'Enter d_x, d_y'), option('bars', 'From cover and bars')]],
    ['slab.dx', 'd_x (mm)', 'number', null, s => s.slab.depthMode === 'explicit'],
    ['slab.dy', 'd_y (mm)', 'number', null, s => s.slab.depthMode === 'explicit'],
    ['slab.cover', 'Top and bottom cover (mm)', 'number'],
    ['slab.xMin', 'Slab edge X min (mm)', 'number'],
    ['slab.xMax', 'Slab edge X max (mm)', 'number'],
    ['slab.yMin', 'Slab edge Y min (mm)', 'number'],
    ['slab.yMax', 'Slab edge Y max (mm)', 'number'],
  ]],
  ['Openings', []],
  ['Materials', [
    ['materials.fck', 'Concrete f_ck (MPa)', 'number'],
    ['materials.fyk', 'Link steel f_yk (MPa)', 'number'],
  ]],
  ['Top flexural reinforcement', [
    ['flexure.areaMode', 'Area input', 'select', [option('explicit', 'Area per metre'), option('bars', 'Bars and spacing')]],
    ['flexure.asx', 'A_s,x (mm²/m)', 'number', null, s => s.flexure.areaMode === 'explicit'],
    ['flexure.asy', 'A_s,y (mm²/m)', 'number', null, s => s.flexure.areaMode === 'explicit'],
    ['flexure.phiX', 'Bar Ø along x (mm)', 'number', null, s => s.flexure.areaMode === 'bars' || s.slab.depthMode === 'bars'],
    ['flexure.sX', 'Spacing along x bars (mm)', 'number', null, s => s.flexure.areaMode === 'bars'],
    ['flexure.phiY', 'Bar Ø along y (mm)', 'number', null, s => s.flexure.areaMode === 'bars' || s.slab.depthMode === 'bars'],
    ['flexure.sY', 'Spacing along y bars (mm)', 'number', null, s => s.flexure.areaMode === 'bars'],
    ['flexure.outer', 'Outer layer', 'select', [option('x', 'Bars along x'), option('y', 'Bars along y')], s => s.slab.depthMode === 'bars'],
  ]],
  ['Design actions', []],
  ['Load increment factor β', [
    ['beta.method', 'Method', 'select', [option('simplified', 'Simplified, β = 1.15'), option('moment', 'From moments (Eq. 6.39, 6.42, 6.43)'), option('user', 'User-defined')]],
    ['beta.confirmed', 'Braced, spans differ ≤ 25 % (§6.4.3(6))', 'checkbox', null, s => s.beta.method === 'simplified'],
    ['beta.userValue', 'β (user value)', 'number', null, s => s.beta.method === 'user'],
  ]],
  ['Punching reinforcement', [
    ['reinforcement.mode', 'Mode', 'select', [option('auto', 'Auto design'), option('provided', 'Check provided')]],
    ['reinforcement.diameter', 'Link Ø (mm)', 'select', [6, 8, 10, 12, 16, 20].map(value => option(value, String(value))), s => s.reinforcement.mode === 'auto'],
    ['reinforcement.shape', 'Link shape', 'select', [option('single', 'Single-leg link'), option('double', 'Two-leg link')], s => s.reinforcement.mode === 'auto'],
    ['reinforcement.legGap', 'Two-leg link width (mm)', 'number'],
  ]],
];

export function buildForm(form, anchors, getState, onChange) {
  const rows = [];
  for (const [title, fields] of GROUPS) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    group.append(legend);
    for (const [path, label, type, options, visible = yes] of fields) {
      const row = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = label;
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
      control.setAttribute('aria-label', label);
      row.append(name, control);
      group.append(row);
      rows.push({ row, control, path, type, options, visible });
    }
    const anchor = anchors[title];
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
