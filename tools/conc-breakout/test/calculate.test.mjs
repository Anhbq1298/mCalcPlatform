import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { migrateInputs, newDefaults, restoreInputs, SCHEMA, validateInputs } from '../src/inputs.mjs';
import { planSvg } from '../src/plan-view.mjs';
import { sectionSvg } from '../src/section-view.mjs';
import { buildReport } from '../src/report.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const make = patch => {
  const input = newDefaults();
  input.options.analysis = 'rigid'; // these tests cover the rigid-plate model; FEM is in fem.test.mjs
  for (const [group, values] of Object.entries(patch)) Object.assign(input[group], values);
  return input;
};
const row = (result, label) => result.rows.find(item => item.label === label);

test('global equilibrium holds for both compression models and a range of axial forces', () => {
  for (const method of ['component', 'block']) for (const N of [-150, 0, 40]) for (const tension of ['excluded', 'shared']) {
    const r = calculate(make({ options: { method }, actions: { N }, studs: { tension } }));
    if (r.eq.unsupported) continue;
    const T = r.eq.tensions.reduce((s, e) => s + e.F, 0);
    close(T - r.eq.C, r.actions.N, 1e-3, `ΣF ${method} N=${N}`);
    close(r.eq.tensions.reduce((s, e) => s + e.F * e.y, 0) - r.eq.C * (r.eq.yC ?? 0), r.actions.M, 1e-1, `ΣM ${method} N=${N}`);
  }
});

test('flange T-stub: pure moment gives T = C = M / z with C at the bearing-area centroid', () => {
  const r = calculate(make({}));
  const c = 25 * Math.sqrt(355 / (3 * 30 * 0.85 / 1.5 * 2 / 3));
  close(r.eq.bearing.c, c, 1e-9, 'c');
  close(r.eq.yC, ((-100 - c) + (-88 + c)) / 2, 1e-9, 'y_c');
  close(r.eq.T, 136.17 * 0.3 * 1e6 / (160 - r.eq.yC), 1e-6, 'T');
  close(r.eq.C, r.eq.T, 1e-6, 'C');
});

test('two bar rows share tension in proportion to their distance from the compression centre', () => {
  const input = make({});
  input.rebars.rows = [{ y: 160, n: 2, d: 16, s: 200 }, { y: 60, n: 2, d: 16, s: 200 }];
  const r = calculate(input);
  const f = y => r.bars.find(bar => bar.y === y).F;
  close(f(160) / f(60), (160 - r.eq.yC) / (60 - r.eq.yC), 1e-9, 'ratio');
});

test('axial compression with small moment needs no tension', () => {
  const r = calculate(make({ actions: { N: -800, V: 20, e: 100, M: 0 } }));
  assert.ok(r.eq.allCompression);
  assert.equal(r.eq.T, 0);
  assert.equal(r.bars.every(bar => bar.F === 0), true);
});

test('pure tension shares between symmetric bar rows', () => {
  const input = make({ actions: { N: 100, V: 0, e: 0, M: 0 } });
  input.rebars.rows = [{ y: 160, n: 2, d: 16, s: 200 }, { y: -160, n: 2, d: 16, s: 200 }];
  const r = calculate(input);
  assert.ok(r.eq.tensionOnly);
  for (const bar of r.bars) close(bar.F, 25e3, 1e-6, bar.id);
});

test('studs in the tension zone are flagged when their tension is neglected, and checked when shared', () => {
  const excluded = calculate(make({}));
  assert.equal(row(excluded, 'Stud tension').status, 'warning');
  assert.equal(row(excluded, 'Concrete cone (tensioned studs)'), undefined);
  const shared = calculate(make({ studs: { tension: 'shared' } }));
  assert.ok(row(shared, 'Concrete cone (tensioned studs)').ratio > 0);
  assert.ok(row(shared, 'Concrete interaction N–V'));
  assert.ok(shared.studs.some(stud => stud.F > 0));
});

test('the design cannot pass until the load path into the member is confirmed', () => {
  assert.equal(calculate(make({})).status, 'Incomplete');
  const confirmed = calculate(make({ options: { loadPathConfirmed: true } }));
  assert.notEqual(confirmed.status, 'Incomplete');
});

test('edge breakout is off without an edge and governs near one', () => {
  assert.equal(row(calculate(make({})), 'Concrete edge breakout').status, 'off');
  const input = make({});
  input.concrete.edges.bottom = 300;
  const r = row(calculate(input), 'Concrete edge breakout');
  assert.equal(r.status, 'fail');
});

test('blow-out and splitting keep shared stud tension Incomplete when not covered', () => {
  const input = make({ studs: { tension: 'shared' }, options: { loadPathConfirmed: true } });
  input.concrete.edges.left = 160; // c = 60 mm ≤ 0.5·h_ef
  const r = calculate(input);
  assert.equal(row(r, 'Side-face blow-out').status, 'incomplete');
  assert.equal(row(r, 'Splitting').status, 'incomplete');
});

test('weak bar welds and the full-width block on a flexible plate raise warnings', () => {
  const r = calculate(make({ rebars: { throat: 4 } }));
  assert.equal(row(r, 'Weld weaker than bar yield').status, 'warning');
  const wide = make({ options: { method: 'block' }, plate: { B: 500, t: 15 } });
  assert.equal(row(calculate(wide), 'Full-width bearing block').status, 'warning');
});

test('straight bars longer than the member are rejected', () => {
  const r = calculate(make({ rebars: { shape: 'straight', length: 400 } }));
  assert.equal(row(r, 'Straight bar fits in the member').status, 'fail');
});

test('validation reports invalid inputs', () => {
  assert.throws(() => validateInputs(make({ plate: { t: 50 } })), /t ≤ 40/);
  assert.throws(() => validateInputs(make({ actions: { V: -1 } })), /downward/);
  const input = make({});
  input.concrete.edges.bottom = 100;
  assert.throws(() => validateInputs(input), /bottom edge cuts/);
});

test('restore keeps unknown fields and refuses a newer schema', () => {
  const restored = restoreInputs({ custom: 1, plate: { t: 30, extra: 'x' } });
  assert.equal(restored.custom, 1);
  assert.equal(restored.plate.extra, 'x');
  assert.equal(restored.plate.t, 30);
  assert.equal(restored.plate.B, 300);
  assert.throws(() => migrateInputs({}, SCHEMA + 1), /newer/);
  assert.equal(restoreInputs(migrateInputs({ plate: { t: 30 } }, 1)).options.analysis, 'rigid');
  assert.equal(restoreInputs({}).options.analysis, 'fem');
});

test('drawings and the Canvas report are generated from the result', () => {
  const input = make({ studs: { tension: 'shared' } });
  input.concrete.edges.bottom = 600;
  const r = calculate(input);
  for (const svg of [planSvg(r), sectionSvg(r)]) {
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
  const doc = buildReport(r, { pageHeight: 1123, pageGap: 40 });
  assert.equal(doc.format, 'calccanvas');
  assert.ok(doc.settings.pages >= 2);
  assert.ok(doc.shapes.some(shape => shape.type === 'table'));
  assert.ok(doc.shapes.every(shape => Number.isFinite(shape.y)));
});
