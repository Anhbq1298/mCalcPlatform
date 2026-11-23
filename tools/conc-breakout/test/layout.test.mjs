import assert from 'node:assert/strict';
import test from 'node:test';
import { unionArea } from '../src/anchors.mjs';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';
import { gridToPoints, resolveLayout, validateLayout } from '../src/layout.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const custom = (patch = {}) => {
  const input = newDefaults();
  Object.assign(input.options, patch);
  input.layout = { mode: 'custom', points: gridToPoints(input) };
  return input;
};

test('a custom layout seeded from the grid reproduces the grid results (rigid and FEM)', () => {
  for (const analysis of ['rigid', 'fem']) {
    const grid = newDefaults();
    grid.options.analysis = analysis;
    grid.studs.tension = 'shared';
    const pts = custom({ analysis });
    pts.studs.tension = 'shared';
    const a = calculate(grid);
    const b = calculate(pts);
    close(b.eq.T, a.eq.T, 1e-6 * a.eq.T, analysis + ' ΣT');
    assert.deepEqual(b.rows.map(row => [row.label, row.status]), a.rows.map(row => [row.label, row.status]));
    for (const row of a.rows.filter(item => item.ratio != null)) close(b.rows.find(item => item.label === row.label).ratio, row.ratio, 1e-9, row.label);
  }
});

test('points can be converted between stud and welded bar, and removed', () => {
  const input = custom();
  const first = input.layout.points.findIndex(p => p.type === 'stud' && p.y > 0);
  input.layout.points[first] = { ...input.layout.points[first], type: 'rebar', d: 20 };
  let layout = resolveLayout(input);
  assert.equal(layout.studs.length, 3);
  assert.equal(layout.bars.length, 3);
  assert.equal(layout.rows.length, 2); // new bar at y = 100 forms its own row
  assert.ok(calculate(input).bars.some(bar => bar.d === 20 && bar.F > 0));
  input.layout.points = input.layout.points.filter(p => !(p.type === 'stud' && p.y < 0 && p.x < 0));
  layout = resolveLayout(input);
  assert.equal(layout.studs.length, 2);
  assert.ok(calculate(input).rows.find(row => row.label === 'Stud steel shear').ratio > 0);
});

test('irregular bar rows use the smallest gap and edge distance for plate bending', () => {
  const input = custom({ analysis: 'rigid' });
  input.layout.points = [
    ...input.layout.points.filter(p => p.type === 'stud'),
    { type: 'rebar', x: -100, y: 160, d: 16 }, { type: 'rebar', x: -40, y: 160, d: 16 }, { type: 'rebar', x: 120, y: 160, d: 16 },
  ];
  const r = calculate(input);
  const row = r.plateRows[0];
  assert.equal(row.n, 3);
  assert.equal(row.p, 60);
  assert.equal(row.e, 30);
});

test('layout validation rejects overlaps, off-plate points and layouts without studs', () => {
  const input = custom();
  input.layout.points.push({ type: 'stud', x: 100, y: 100 });
  assert.throws(() => validateLayout(input), /overlap/);
  const off = custom();
  off.layout.points.push({ type: 'rebar', x: 0, y: 199, d: 16 });
  assert.throws(() => validateLayout(off), /off the plate/);
  const none = custom();
  none.layout.points = none.layout.points.filter(p => p.type !== 'stud');
  assert.throws(() => validateLayout(none), /headed stud/);
});

test('exact union area of projected cone squares for a non-grid group', () => {
  const box = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  close(unionArea([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], 100, box), 3 * 200 * 200 - 2 * 100 * 200 + 0, 1e-9, 'L-shape');
  close(unionArea([{ x: 0, y: 0 }, { x: 500, y: 500 }], 100, box), 2 * 200 * 200, 1e-9, 'disjoint');
  close(unionArea([{ x: 0, y: 0 }], 100, { ...box, x0: -50 }), 150 * 200, 1e-9, 'clipped');
});

test('FEM reports the close-to-rigid deviations', () => {
  const row = calculate(newDefaults()).rows.find(item => item.label === 'Flexible vs rigid plate');
  assert.match(row.detail, /max element [+-]\d+% · sum [+-]?\d+%|max element/);
  assert.match(row.detail, /non-linearity/);
});
