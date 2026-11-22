import assert from 'node:assert/strict';
import test from 'node:test';
import { arcLengthAt, arrangedLayers, faceGaps, outerPerimeterEf } from '../src/arrangement.mjs';
import { layerSummary, buildLinks } from '../src/layout.mjs';
import { calculate } from '../src/calculate.mjs';
import { pointAt } from '../src/geometry.mjs';
import { cenDefaults, newDefaults, restoreInputs } from '../src/inputs.mjs';

const column = { shape: 'rectangular', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 };
const model = { column, slab: null, openings: [], shadows: [] };
const make = (type, extra = {}) => arrangedLayers({ model: { ...model, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 } }, d: 200, aOut: 900, type, sr: 150, st: 150, rails: 12, diameter: 10, shape: 'single', first: 80, outerK: 1.5, ...extra });

test('arc length projection returns the point on the control path', () => {
  for (const s of [0, 120, 400, 777, 1300]) {
    const p = pointAt(column, 230, s);
    assert.ok(Math.abs(arcLengthAt(column, 230, p) - s) < 1e-6, String(s));
  }
});

test('layers at s0 + k·s_r up to u_out,ef − 1.5d, at least two', () => {
  const { layers } = make('grid');
  assert.deepEqual(layers.map(layer => layer.offset), [80, 230, 380, 530, 680]); // last ≥ 900 − 300
});

test('radial rails (Fig. 6.22 A): face rails as cruciform plus the fewest corner rails for s_t ≤ 1.5d in u1', () => {
  const wide = { ...column, cx: 300, cy: 900 };
  const mdl = { column: wide, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 }, openings: [], shadows: [] };
  const { layers, rails } = arrangedLayers({ model: mdl, d: 200, aOut: 900, type: 'radial', sr: 150, diameter: 10, shape: 'single', first: 80, outerK: 1.5 });
  assert.equal(layers[0].points.length, 2 * 2 + 2 * 4 + 4 * rails); // faces 300 and 900 at ≤ 1.5d = 300
  for (const layer of layers) {
    for (const p of layer.points) {
      const q = pointAt(wide, layer.offset, p.s);
      assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1e-6); // every stud lies on the control path at its offset
    }
    if (layer.offset <= 400) assert.ok((Math.PI / 2) * layer.offset / (rails + 1) <= 300 + 1e-9); // corner gap
  }
});

test('orthogonal grid: ring points on the rectangle at the offset, grid lines ≤ s_t apart', () => {
  const { layers } = make('grid');
  const all = layers.flatMap(layer => layer.points);
  const xs = [...new Set(all.map(p => Math.round(p.x * 1e6) / 1e6))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] <= 150 + 1e-6);
  for (const layer of layers) {
    const edge = 200 + layer.offset;
    assert.ok(layer.points.every(p => Math.abs(Math.max(Math.abs(p.x), Math.abs(p.y)) - edge) < 1e-6));
  }
  assert.equal(new Set(all.map(p => `${p.x},${p.y}`)).size, all.length); // no point in two rings
});

test('no link outside the slab: grid at an edge column keeps only points inside', () => {
  const input = cenDefaults();
  Object.assign(input.column, { position: 'edge', cx: 400, cy: 400, x: 0, y: 0 });
  input.slab.xMax = 200;
  input.beta = { method: 'simplified', confirmed: true, userValue: 1.4 };
  input.loads = [{ name: 'A', V: 290, Mx: 0, My: 0 }];
  const result = calculate(input);
  assert.ok(result.layout.links.length > 0, result.status + ' ' + JSON.stringify(result.issues ?? result.layout.reason));
  assert.ok(result.layout.links.every(link => link.legs.every(leg => leg.x <= 200 + 1e-6)));
});

test('defaults: orthogonal grid at 150 mm and flexural bars; older auto saves move to the grid, A_s kept', () => {
  const r = newDefaults().reinforcement;
  assert.deepEqual([r.arrangement, r.sr, r.st], ['grid', 150, 150]);
  const old = restoreInputs({ reinforcement: { mode: 'auto' }, flexure: { areaMode: 'explicit', asx: 1090, asy: 1090, phiX: 16, phiY: 16 } });
  assert.equal(old.reinforcement.arrangement, 'grid');
  assert.equal(old.flexure.areaMode, 'bars');
  assert.ok(Math.abs((Math.PI * 64 * 1000) / old.flexure.sX - 1090) < 1e-9);
});

test('cruciform rails (Fig. 6.22 B): rails in line with the column edges, ≤ 1.5d apart on each face', () => {
  const wide = { ...column, cx: 300, cy: 900 };
  const { layers } = arrangedLayers({ model: { column: wide, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 }, openings: [], shadows: [] }, d: 200, aOut: 900, type: 'cruciform', sr: 150, diameter: 10, shape: 'single', first: 80, outerK: 1.5 });
  const top = layers[0].points.filter(p => p.y > 450).map(p => p.x).sort((a, b) => a - b);
  assert.deepEqual(top, [-150, 150]); // 300 ≤ 1.5d = 300: two rails
  const side = layers[0].points.filter(p => p.x > 150).map(p => p.y).sort((a, b) => a - b);
  assert.equal(side.length, 4); // 900 / 300 → 4 rails, 300 apart
  assert.ok(Math.abs(side[1] - side[0] - 300) < 1e-9);
});

test('cruciform: only gaps along a face count as s_t; the corner gaps are left to u_out,ef', () => {
  const mdl = { column, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 }, openings: [], shadows: [], intervalsAt: r => { const u = 4 * 400 + 2 * Math.PI * r; return { u, total: u, intervals: [{ s0: 0, s1: u, closed: true }] }; } };
  const { layers } = arrangedLayers({ model: mdl, d: 200, aOut: 900, type: 'cruciform', sr: 150, diameter: 10, shape: 'single', first: 80, outerK: 1.5 });
  const outer = layers.at(-1);
  const [summary] = layerSummary(mdl, [outer], buildLinks(mdl, [outer], 'auto'));
  assert.ok(summary.tangential.max > 300); // around the corner
  assert.ok(Math.abs(faceGaps(column, outer.offset, summary.tangential).max - 400 / 2) < 1e-6); // 400 face, 3 rails
});

test('u_out,ef (Fig. 6.22): Σ min(L_i, 2d) + 2π·1.5d', () => {
  const square = [{ x: 100, y: 100 }, { x: -100, y: 100 }, { x: -100, y: -100 }, { x: 100, y: -100 }];
  const close = outerPerimeterEf(square, 200); // sides 200 ≤ 2d: full polygon + arcs (Fig. 6.22 A)
  assert.ok(Math.abs(close.u - (800 + 3 * Math.PI * 200)) < 1e-9 && close.u === close.full);
  const far = outerPerimeterEf(square.map(p => ({ x: 5 * p.x, y: 5 * p.y })), 200); // sides 1000 > 2d = 400
  assert.ok(Math.abs(far.u - (4 * 400 + 3 * Math.PI * 200)) < 1e-9 && far.full > far.u);
});

test('required vs effective outer perimeter: same u_out,req, different u_out,ef per arrangement', () => {
  const run = arrangement => {
    const input = cenDefaults();
    input.beta.confirmed = true;
    input.loads = [{ name: 'U', V: 800, Mx: 0, My: 0 }];
    input.reinforcement.arrangement = arrangement;
    return calculate(input);
  };
  const results = ['grid', 'radial', 'cruciform'].map(run);
  const outer = results.map(result => result.loads[0].rows.find(row => row.id === 'outer'));
  assert.ok(outer.every(row => Math.abs(row.demand - outer[0].demand) < 1e-9)); // u_out,req
  assert.ok(outer[0].ur <= 1 && outer[2].resistance < outer[0].resistance); // grid covers, cruciform loses the corners
  assert.ok(results.every(result => result.layout.outerEf));
});

test('cruciform reaches u_out,req by widening the arms, not by longer rails', () => {
  const input = cenDefaults();
  input.beta.confirmed = true;
  input.loads = [{ name: 'U', V: 800, Mx: 0, My: 0 }];
  input.reinforcement.arrangement = 'cruciform';
  const result = calculate(input);
  const outer = result.loads[0].rows.find(row => row.id === 'outer');
  assert.ok(outer.ur <= 1, String(outer.ur));
  const top = result.layout.layers[0].points.filter(p => p.y > 450).map(p => p.x);
  assert.ok(Math.max(...top) > 150 + 1e-6); // rails beside the 300 mm face, outside the column edge
});

test('u_out,ef matches Ancon Shearfix EC2 manual Example 16.1 (cruciform, published 6371 mm)', () => {
  // 600 × 400 column, d = 204; arms y_sr0 = 804, z_sr0 = 604 wide (outer stud lines); Ancon: u_out,ef =
  // 2(y_sr0 + 2d + 0.75πd + z_sr0 + 2d + 0.75πd) = 6371 mm. Outer studs far enough out that the corner gaps exceed 2d.
  const o = 600;
  // Rails across each arm end ≤ 2d apart (the manual's main and secondary rails), so only the corner gaps are cut.
  const across = half => [-half, -half / 2, 0, half / 2, half];
  const pts = [
    ...across(402).flatMap(x => [{ x, y: 200 + o }, { x, y: -200 - o }]),
    ...across(302).flatMap(y => [{ x: 300 + o, y }, { x: -300 - o, y }]),
  ];
  const ef = outerPerimeterEf(pts, 204);
  assert.ok(Math.abs(ef.u - 6371) < 0.5, String(ef.u)); // published value rounded to 1 mm
});

test('auto arrangement: s_r capped at 0.75d with a note; rails added until Eq. 6.52 A_sw is met', async () => {
  const thin = cenDefaults();
  Object.assign(thin.slab, { h: 200, dx: 164, dy: 164 });
  thin.beta.confirmed = true;
  thin.loads = [{ name: 'U', V: 450, Mx: 0, My: 0 }];
  const capped = calculate(thin);
  assert.equal(capped.envelope.sr, 120); // 0.75 × 164 = 123 → 120
  assert.ok(capped.notes.some(note => note.includes('exceeds 0.75d')));
  const { CASES } = await import('../src/examples.mjs');
  const { calculateDesign } = await import('../src/head.mjs');
  const input = structuredClone(CASES.find(c => c.id === 'drop-through').input);
  input.reinforcement = { ...input.reinforcement, mode: 'auto', arrangement: 'cruciform', sr: 150, st: 150 };
  const result = calculateDesign(input);
  assert.ok(result.loads[0].rows.find(row => row.id === 'reinforced').ur <= 1);
});

test('grid: outer rings at whole multiples of s_t within s_t, Eq. 6.52, Eq. 9.11 and u_out,ef', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { exampleById } = await import('../src/examples.mjs');
  const input = structuredClone(exampleById('internal-links').input);
  const run = thin => calculateDesign({ ...input, reinforcement: { ...input.reinforcement, enabled: true, mode: 'auto', arrangement: 'grid', sr: 150, st: 150, thin } });
  const [full, thin] = [run(false), run(true)];
  assert.equal(thin.layout.layers[0].points.length, full.layout.layers[0].points.length); // inner ring keeps s_t
  const multiples = thin.layout.layers.map(layer => layer.multiple);
  assert.ok(multiples.every((m, i) => i === 0 || m >= multiples[i - 1])); // never denser outward
  assert.ok(thin.layout.links.length < full.layout.links.length);
  assert.equal(thin.status, 'Pass');
  const outer = row => thin.loads[0].rows.find(entry => entry.id === row);
  assert.ok(Math.abs(outer('outer').resistance - full.loads[0].rows.find(entry => entry.id === 'outer').resistance) < 1e-6); // gaps ≤ 2d: u_out,ef unchanged
});
