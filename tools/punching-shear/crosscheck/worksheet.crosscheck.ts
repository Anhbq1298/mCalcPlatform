// Evaluates the generated Canvas worksheet with the Canvas calculation engine and compares every
// live formula and check against the tool's own solver. Run with: npm run test:punching-canvas
import { expect, test } from 'vitest';
import { CalculationEngine } from '../../../vendor/calccanvas/src/engine/index.ts';
import { calcKey } from '../../../vendor/calccanvas/src/canvas/calcOrder.ts';
import { A4, PAGE_GAP } from '../../../vendor/calccanvas/src/export/pageGeometry.ts';
import { calculate } from '../src/calculate.mjs';
import { exampleById } from '../src/examples.mjs';
import { calculateDesign } from '../src/head.mjs';
import { newDefaults } from '../src/inputs.mjs';
import { buildWorksheet } from '../src/worksheet.mjs';

function evaluate(result) {
  const document = buildWorksheet(result, { pageHeight: A4.h, pageGap: PAGE_GAP });
  const math = document.shapes.filter(shape => shape.type === 'math');
  const shapes = Object.fromEntries(document.shapes.map(shape => [shape.id, shape]));
  const engine = new CalculationEngine({ unitSystem: 'SI' });
  engine.batch(() => {
    for (const shape of math) engine.setRegion(shape.id, { latex: shape.props.latex, order: calcKey(shape, shapes), displayUnit: shape.props.displayUnit || null, precision: null });
  });
  const failures = [];
  const values = {};
  const checks = [];
  for (const shape of math) {
    const output = engine.getResult(shape.id);
    if (output?.status !== 'valid') failures.push(shape.props.latex + ' → ' + (output?.error?.message ?? output?.status));
    const key = shape.props.latex.split('\\coloneq')[0];
    if (shape.props.latex.includes('\\coloneq')) values[key] = output?.value;
    if (output?.check) checks.push({ latex: shape.props.latex, pass: output.check.pass });
  }
  return { failures, values, checks, document };
}

// Engine result in the region's display unit (MPa, mm, …).
const si = value => value?.number;

function cases() {
  const list = [];
  const add = (name, edit) => { const input = newDefaults(); input.beta.confirmed = true; edit(input); list.push([name, input]); };
  add('CSI geometry, simplified β, k_max exceeded', () => {});
  add('auto layout, single legs', input => { input.loads = [{ name: 'A', V: 800, Mx: 0, My: 0 }]; });
  add('uniaxial moment, rectangular', input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 700, Mx: 0, My: 110 }, { name: 'B', V: 650, Mx: 90, My: 0 }]; });
  add('biaxial, rotated rectangle, two-leg links', input => { input.beta = { method: 'moment' }; input.column.rotation = 30; input.reinforcement.shape = 'double'; input.loads = [{ name: 'A', V: 700, Mx: 50, My: 80 }]; });
  add('circular column with moment', input => { input.beta = { method: 'moment' }; input.column.shape = 'circular'; input.column.diameter = 550; input.loads = [{ name: 'A', V: 750, Mx: 40, My: 70 }]; });
  add('no links required', input => { input.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }]; });
  add('provided layout with detailing failures', input => {
    input.loads = [{ name: 'A', V: 750, Mx: 0, My: 0 }];
    input.reinforcement = { mode: 'provided', diameter: 10, shape: 'single', legGap: 100, layers: [
      { offset: 150, diameter: 10, shape: 'single', links: 10, start: 0, omitted: [] },
      { offset: 330, diameter: 8, shape: 'single', links: 16, start: 0, omitted: [2] },
    ] };
  });
  add('bars-derived depth, user β', input => {
    input.beta = { method: 'user', userValue: 1.3 };
    Object.assign(input.slab, { depthMode: 'bars', cover: 30 });
    Object.assign(input.flexure, { areaMode: 'bars', phiX: 20, sX: 125, phiY: 16, sY: 150, outer: 'y' });
    input.loads = [{ name: 'A', V: 760, Mx: 0, My: 0 }];
  });
  const edge = input => {
    input.column = { ...input.column, position: 'edge', cx: 400, cy: 300, x: 3800, y: 0 };
    input.slab = { ...input.slab, h: 240, dx: 200, dy: 200 };
  };
  add('edge column, Eq. 6.44 with e_par, links', input => { edge(input); input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 250, Mx: 20, My: -30 }]; input.reinforcement.anchorage.engaged = true; });
  add('edge column, simplified β 1.4', input => { edge(input); input.loads = [{ name: 'A', V: 200, Mx: 0, My: 0 }]; });
  add('corner column, Eq. 6.46', input => { edge(input); input.column = { ...input.column, position: 'corner', y: 3850 }; input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 150, Mx: -10, My: -15 }]; });
  add('openings within 6d, σ_cp, bend anchorage', input => {
    input.openings = [{ x: 700, y: 0, w: 300, h: 200 }];
    input.prestress = { sigmaX: 1.5, sigmaY: 0.5 };
    input.loads = [{ name: 'A', V: 700, Mx: 0, My: 0 }];
    input.reinforcement.anchorage = { type: 'bend', mandrelFactor: 4, extension: 90, engaged: false };
  });
  add('Singapore profile, C60 capped to C50 for shear', input => { input.code = { ...input.code, profile: 'sg', naConfirmed: true }; input.materials.fck = 60; input.loads = [{ name: 'A', V: 1000, Mx: 0, My: 0 }]; });
  add('UK profile, confirmed', input => { input.code = { ...input.code, profile: 'uk', naConfirmed: true }; input.loads = [{ name: 'A', V: 900, Mx: 0, My: 0 }]; });
  // Drop panels: the worksheet documents the governing section solved by calculateDesign.
  for (const id of ['drop-small', 'drop-large', 'drop-circular']) list.push(['example ' + id, exampleById(id).input, calculateDesign]);
  return list;
}

for (const [name, input, solve = calculate] of cases()) {
  test('worksheet matches solver: ' + name, () => {
    const result = solve(input);
    const { failures, values, checks } = evaluate(result);
    expect(failures).toEqual([]);
    const close = (actual, expected, label) => expect(Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12), label).toBeLessThan(1e-6);
    close(si(values['v_{Rd.c}']), result.resistance.vRdc, 'v_Rd,c');
    close(si(values['v_{Rd.max}']), result.vRdMax, 'v_Rd,max');
    close(si(values['u_{1}']), result.u1, 'u_1');
    close(si(values['f_{ywd.ef}']), result.fywdEf, 'f_ywd,ef');
    result.loads.forEach((load, index) => {
      const i = index + 1;
      close(si(values[`\\beta_{${i}}`]), load.beta.value, 'β ' + load.name);
      close(si(values[`v_{Ed1.${i}}`]), load.vEd1, 'v_Ed1 ' + load.name);
      const reinforced = load.rows.find(row => row.id === 'reinforced');
      if (reinforced?.vRdcs) close(si(values[`v_{Rd.cs.${i}}`]), reinforced.vRdcs, 'v_Rd,cs ' + load.name);
      if (load.required) close(si(values[`a_{out.${i}}`]), load.aOut, 'a_out ' + load.name);
    });
    const expected = new Map();
    result.loads.forEach((load, index) => {
      const i = index + 1;
      const status = id => load.rows.find(row => row.id === id)?.status;
      expected.set(`v_{Ed0.${i}}\\le v_{Rd.max}`, status('max') === 'Pass');
      if (!load.required) expected.set(`v_{Ed1.${i}}\\le v_{Rd.c}`, status('concrete') === 'Pass');
      else {
        expected.set(`v_{Ed1.${i}}\\le k_{max}v_{Rd.c}`, status('kmax') === 'Pass');
        if (load.rows.find(row => row.id === 'reinforced')?.vRdcs) expected.set(`v_{Ed1.${i}}\\le v_{Rd.cs.${i}}`, status('reinforced') === 'Pass');
      }
    });
    for (const check of checks) {
      if (expected.has(check.latex)) expect(check.pass, check.latex).toBe(expected.get(check.latex));
    }
    if (result.u1Star) close(si(values['u_{1s}']), result.u1Star, 'u1*');
    close(si(values['u_{0}']), result.u0, 'u0');
    for (const row of result.detailing?.rows ?? []) {
      const phi = row.id.split('-')[1];
      const latex = row.id === 'depth' ? 'h\\ge200\\,\\mathrm{mm}'
        : row.id.startsWith('mandrel') ? `\\phi_{m.${phi}}\\ge` : row.id.startsWith('extension') ? `l_{ext}\\ge\\max\\left(` : row.id.startsWith('fit') ? `h-2c\\ge\\phi_{m.${phi}}` : null;
      if (!latex) continue;
      const found = checks.filter(check => check.latex.startsWith(latex) && (!phi || check.latex.includes(phi)));
      expect(found.length, row.id).toBeGreaterThan(0);
      for (const check of found) expect(check.pass, row.id).toBe(row.status === 'Pass');
    }
    const governing = result.loads.find(load => load.layoutCheck)?.layoutCheck;
    if (governing) {
      const byLatex = latex => checks.find(check => check.latex === latex)?.pass;
      const rows = Object.fromEntries(result.loads.find(load => load.layoutCheck).rows.map(row => [row.id, row.status]));
      expect(byLatex('a_{L1}\\le0.5d'), 'first layer').toBe(rows.first === 'Pass');
      if (rows.radial !== 'Incomplete input') expect(byLatex('s_{r}\\le0.75d'), 'radial').toBe(rows.radial === 'Pass');
      governing.layerRows.forEach((entry, index) => {
        const j = index + 1;
        const tangential = checks.find(check => check.latex.startsWith(`s_{t.L${j}}\\le`));
        expect(tangential?.pass, 'tangential L' + j).toBe(entry.tangential.status === 'Pass');
        const minimum = checks.find(check => check.latex.startsWith(`0.25\\pi\\phi_{L${j}}^2\\ge`));
        expect(minimum?.pass, 'minimum L' + j).toBe(entry.minimum.status === 'Pass');
      });
    }
  });
}
