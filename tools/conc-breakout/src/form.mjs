// Input form: grouped fields bound to paths in the input model, plus the welded-bar row table.
import { PLATE_GRADES } from './inputs.mjs';

const num = (path, label, extra = {}) => ({ path, label, kind: 'number', ...extra });
const opt = (path, label) => ({ path, label, kind: 'number', optional: true });
const check = (path, label) => ({ path, label, kind: 'checkbox' });
const choice = (path, label, options) => ({ path, label, kind: 'select', options });

export const GROUPS = [
  ['Design actions', [
    num('actions.N', 'N<sub>Ed</sub> (kN, tension +)'), num('actions.V', 'V<sub>Ed</sub> (kN, downward)', { min: 0 }),
    num('actions.e', 'e<sub>V</sub> from plate face (mm)'), num('actions.M', 'M<sub>Ed</sub> at plate face (kN·m)'),
  ]],
  ['Receiving concrete member', [
    num('concrete.fck', 'f<sub>ck</sub> (MPa)', { min: 12, max: 90 }), check('concrete.cracked', 'Cracked concrete'),
    num('concrete.alphaCc', 'α<sub>cc</sub>', { min: 0.8, max: 1, step: 0.05 }), num('concrete.thickness', 'Member thickness h (mm)', { min: 1 }),
    opt('concrete.edges.bottom', 'Edge below, from plate centre (mm)'), opt('concrete.edges.top', 'Edge above (mm)'),
    opt('concrete.edges.left', 'Edge left (mm)'), opt('concrete.edges.right', 'Edge right (mm)'),
    check('concrete.edgeReinforcement', 'Edge reinforcement and stirrups ≤ 100 mm (ψ<sub>re,V</sub> = 1.4)'),
    check('concrete.denseReinforcement', 'Reinforcement spacing ≥ 150 mm (ψ<sub>re,N</sub> = 1)'),
    check('concrete.splittingReinforcement', 'Reinforcement resists splitting, w<sub>k</sub> ≤ 0.3 mm'),
  ]],
  ['Plate and steel member', [
    choice('plate.grade', 'Plate grade', Object.keys(PLATE_GRADES).map(value => [value, value])),
    num('plate.B', 'Plate width B (mm)'), num('plate.H', 'Plate height H (mm)'), num('plate.t', 'Plate thickness t (mm)', { max: 40 }),
    num('member.b', 'Member flange width b (mm)'), num('member.h', 'Member depth h<sub>m</sub> (mm)'),
    num('member.tf', 'Flange thickness t<sub>f</sub> (mm)'), num('member.weld', 'Member weld throat a<sub>w</sub> (mm)'),
  ]],
  ['Welded reinforcing bars', [
    num('rebars.fyk', 'f<sub>yk</sub> (MPa)'), num('rebars.k', 'k = f<sub>t</sub>/f<sub>y</sub>', { step: 0.01 }),
    choice('rebars.shape', 'Bar shape', [['bent', 'Bent (90°)'], ['straight', 'Straight']]),
    num('rebars.length', 'Anchorage length l<sub>b,prov</sub> (mm)'), num('rebars.mandrel', 'Mandrel φ<sub>m</sub> (mm)'),
    num('rebars.cd', 'Cover c<sub>d</sub> for α<sub>1</sub> (mm)'), check('rebars.goodBond', 'Good bond conditions'),
    num('rebars.throat', 'Bar weld throat a (mm)'),
  ]],
  ['Headed studs', [
    num('studs.d', 'Shank Ø d (mm)'), num('studs.dh', 'Head Ø d<sub>h</sub> (mm)'), num('studs.hef', 'h<sub>ef</sub> from concrete face (mm)'),
    num('studs.fuk', 'f<sub>uk</sub> (MPa)'), num('studs.fyk', 'f<sub>yk</sub> (MPa)'), check('studs.ductile', 'Ductile steel (A<sub>5</sub> > 8%)'),
    num('studs.nx', 'Studs across, n<sub>x</sub>', { step: 1, min: 1 }), num('studs.ny', 'Stud rows, n<sub>y</sub>', { step: 1, min: 1 }),
    num('studs.sx', 's<sub>x</sub> (mm)'), num('studs.sy', 's<sub>y</sub> (mm)'), num('studs.k8', 'k<sub>8</sub> pry-out (product data)', { step: 0.1 }),
    choice('studs.tension', 'Stud tension', [['excluded', 'Neglected (bars take tension)'], ['shared', 'Studs share tension']]),
  ]],
  ['Model and confirmations', [
    choice('options.analysis', 'Plate analysis', [['fem', 'Flexible plate (FEM)'], ['rigid', 'Rigid plate']]),
    choice('options.method', 'Compression model', [['component', 'Flange T-stub (EN 1993-1-8)'], ['block', 'Full-width block']]),
    num('options.betaJ', 'β<sub>j</sub>', { step: 0.01 }), num('options.alpha', 'α spread factor (EC2 Eq. 6.63)', { min: 1, max: 3, step: 0.1 }),
    check('options.friction', 'Use friction 0.2·N<sub>c,Ed</sub>'),
    check('options.loadPathConfirmed', 'Transfer into member reinforcement verified'),
  ]],
];

export const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
export function set(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((value, key) => value[key], object)[last] = value;
}

function field(def) {
  const row = document.createElement('label');
  if (def.kind === 'checkbox') row.className = 'check-row';
  const name = document.createElement('span');
  name.innerHTML = def.label;
  let input;
  if (def.kind === 'select') {
    input = document.createElement('select');
    for (const [value, text] of def.options) input.add(new Option(text, value));
  } else {
    input = document.createElement('input');
    input.type = def.kind;
    if (def.kind === 'number') {
      input.step = def.step ?? 'any';
      if (def.min !== undefined) input.min = def.min;
      if (def.max !== undefined) input.max = def.max;
      if (def.optional) input.placeholder = 'none';
    }
  }
  input.dataset.path = def.path;
  row.append(...(def.kind === 'checkbox' ? [input, name] : [name, input]));
  return row;
}

const ROW_COLUMNS = [['y', 'y (mm)'], ['n', 'n'], ['d', 'Ø'], ['s', 's (mm)']];

export function buildForm(form, getState, onChange) {
  for (const [title, defs] of GROUPS) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    group.append(legend, ...defs.map(field));
    if (title === 'Welded reinforcing bars') group.append(rowTable());
    form.append(group);
  }
  function rowTable() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p class="table-caption">Bar rows: y from the plate centre, n bars at spacing s across the plate.</p>
      <table class="layer-table" id="bar-rows"><thead><tr><th scope="col">Row</th>${ROW_COLUMNS.map(([, text]) => `<th scope="col">${text}</th>`).join('')}</tr></thead><tbody></tbody></table>
      <div class="layer-buttons"><button type="button" data-add-row>+ Row</button><button type="button" data-remove-row>− Row</button></div>`;
    wrap.querySelector('[data-add-row]').addEventListener('click', () => {
      const rows = getState().rebars.rows;
      const last = rows.at(-1) ?? { y: 100, n: 2, d: 16, s: 150 };
      rows.push({ ...last, y: last.y - 60 });
      onChange();
      refresh();
    });
    wrap.querySelector('[data-remove-row]').addEventListener('click', () => {
      getState().rebars.rows.pop();
      onChange();
      refresh();
    });
    return wrap;
  }
  form.addEventListener('input', event => {
    const input = event.target;
    const state = getState();
    if (input.dataset.path) {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number'
        ? (input.value === '' && input.placeholder === 'none' ? null : input.valueAsNumber) : input.value;
      set(state, input.dataset.path, value);
    } else if (input.dataset.row !== undefined) {
      state.rebars.rows[Number(input.dataset.row)][input.dataset.key] = input.valueAsNumber;
    } else return;
    onChange();
  });
  function refresh() {
    const state = getState();
    for (const input of form.querySelectorAll('[data-path]')) {
      const value = get(state, input.dataset.path);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value ?? '';
    }
    const body = form.querySelector('#bar-rows tbody');
    body.replaceChildren(...state.rebars.rows.map((row, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<th scope="row">${index + 1}</th>` + ROW_COLUMNS.map(([key, text]) =>
        `<td><input type="number" step="any" aria-label="Row ${index + 1} ${text}" data-row="${index}" data-key="${key}" value="${row[key]}"></td>`).join('');
      return tr;
    }));
    form.querySelector('[data-remove-row]').disabled = !state.rebars.rows.length;
  }
  return refresh;
}
