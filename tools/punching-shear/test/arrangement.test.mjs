import assert from 'node:assert/strict';
import test from 'node:test';
import { arcLengthAt, arrangedLayers, outerPerimeterEf } from '../src/arrangement.mjs';
import { layerSummary, buildLinks } from '../src/layout.mjs';
import { calculate } from '../src/calculate.mjs';
import { distanceToColumn, pointAt } from '../src/geometry.mjs';
import { cenDefaults, newDefaults, restoreInputs } from '../src/inputs.mjs';

const column = { shape: 'rectangular', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 };
const model = { column, slab: null, openings: [], shadows: [] };
const make = (type, extra = {}) => arrangedLayers({ model: { ...model, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 } }, d: 200, aOut: 900, type, sr: 150, st: 150, diameter: 10, shape: 'single', first: 80, outerK: 1.5, ...extra });

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
  const results = ['grid', 'radial'].map(run);
  const outer = results.map(result => result.loads[0].rows.find(row => row.id === 'outer'));
  assert.ok(outer.every(row => Math.abs(row.demand - outer[0].demand) < 1e-9)); // u_out,req
  assert.ok(outer[0].ur <= 1 && outer[1].resistance !== outer[0].resistance); // effective perimeters differ
  assert.ok(results.every(result => result.layout.outerEf));
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

test('auto arrangement: s_r capped at 0.75d with a note; lines added until Eq. 6.52 A_sw is met', async () => {
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
  input.reinforcement = { ...input.reinforcement, mode: 'auto', arrangement: 'radial', sr: 150, st: 150, srAuto: true };
  const result = calculateDesign(input);
  assert.ok(result.loads[0].rows.find(row => row.id === 'reinforced').ur <= 1);
});

test('grid: rings at whole multiples of s_t within s_t, Eq. 6.52, Eq. 9.11 and u_out,ef', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { exampleById } = await import('../src/examples.mjs');
  const input = structuredClone(exampleById('internal-links').input);
  const run = thin => calculateDesign({ ...input, reinforcement: { ...input.reinforcement, enabled: true, mode: 'auto', arrangement: 'grid', sr: 150, st: 150, thin } });
  const [full, thin] = [run(false), run(true)];
  assert.ok(thin.layout.layers[0].points.length <= full.layout.layers[0].points.length); // every ring may widen
  const multiples = thin.layout.layers.map(layer => layer.multiple);
  assert.ok(multiples.every((m, i) => i === 0 || m >= multiples[i - 1])); // never denser outward
  assert.ok(thin.layout.links.length < full.layout.links.length);
  assert.equal(thin.status, 'Pass');
  const outer = row => thin.loads[0].rows.find(entry => entry.id === row);
  assert.ok(Math.abs(outer('outer').resistance - full.loads[0].rows.find(entry => entry.id === 'outer').resistance) < 1e-6); // gaps ≤ 2d: u_out,ef unchanged
});

test('auto grid follows the flexural bars: links on bar lines at the bar spacing, fallback with a note', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const run = edit => { const input = newDefaults(); input.reinforcement.enabled = true; input.reinforcement.thin = false; input.loads = [{ name: 'U', V: 800, Mx: 0, My: 0 }]; edit(input); return calculateDesign(input); };
  const on = run(input => { input.flexure.sX = input.flexure.sY = 125; });
  assert.equal(on.envelope.sr, 125);
  const xs = [...new Set(on.layout.layers.flatMap(layer => layer.points.map(p => Math.round(p.x * 1e3) / 1e3)))].sort((a, b) => a - b);
  const steps = xs.slice(1).map((x, i) => x - xs[i]).filter(step => Math.abs(step - 125) > 1e-6);
  assert.ok(steps.length <= 2, String(steps)); // bar spacing everywhere except the closing bar at the centre
  const off = run(input => { input.flexure.sX = 150; input.flexure.sY = 200; });
  assert.ok(off.notes.some(note => note.includes('Grid not on the flexural bars')));
});

test('rotated column: grid on the bars around the circumscribed rectangle, links on bar lines', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const input = newDefaults();
  input.reinforcement.enabled = true;
  input.column.rotation = 30;
  input.loads = [{ name: 'U', V: 900, Mx: 0, My: 0 }];
  const result = calculateDesign(input);
  assert.equal(result.envelope.sr, 150);
  const xs = [...new Set(result.layout.links.map(link => Math.round(link.position.x * 1e3) / 1e3))].sort((a, b) => a - b);
  const odd = xs.slice(1).map((x, i) => x - xs[i]).filter(step => Math.abs(step - 150) > 1e-3);
  assert.ok(odd.length <= 2, String(odd)); // global bar lines at the bar spacing (closing bar at the centre)
  assert.equal(result.status, 'Fail');
  assert.ok(result.loads[0].rows.some(row => row.id === 'tangential' && row.status === 'Fail'));

  input.loads[0].V = 800;
  const compactGrid = calculateDesign(input);
  assert.equal(compactGrid.compactOuterZone, true);
  assert.equal(compactGrid.loads[0].rows.find(row => row.id === 'tangential').status, 'Fail');
  input.reinforcement.arrangement = 'radial';
  assert.equal(calculateDesign(input).status, 'Pass');
});

test('drop: grid links run out to the drop edge (less cover) on every side; extra links not in the checks', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const input = newDefaults();
  input.reinforcement.enabled = true;
  input.reinforcement.dropFill = true;
  input.head = { ...input.head, enabled: true, shape: 'rectangular', lx: 2400, ly: 2400, thickness: 400 };
  input.loads = [{ name: 'U', V: 1600, Mx: 20, My: 40 }];
  const result = calculateDesign(input);
  const edge = result.layout.links.filter(link => link.edge);
  assert.ok(edge.length > 0);
  const reach = Math.max(...result.layout.links.map(link => Math.abs(link.position.x)));
  assert.ok(reach > 1200 - 25 - 150 - 1e-6 && reach <= 1200 - 25 + 1e-6); // within one spacing of the drop edge, inside the cover
  assert.ok(result.layout.summary.every(layer => layer.id !== 'E')); // rings only in the checks
});

test('grid lines start at the corners of the first ring and step at exactly s_t', () => {
  const { layers } = make('grid');
  const xs = [...new Set(layers[0].points.map(p => Math.round(p.x * 1e6) / 1e6))].sort((a, b) => a - b);
  assert.equal(xs[0], -(200 + 80));
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(steps.filter(step => Math.abs(step - 150) > 1e-6).length <= 2, String(steps)); // centre closing gap only
});

test('radial: orthogonal face lines (edges in line, ≤ 1.5d apart); corner lines only where the gap needs them', () => {
  const wide = { ...column, cx: 300, cy: 900 };
  const mdl = { column: wide, slab: { xMin: -1e5, xMax: 1e5, yMin: -1e5, yMax: 1e5 }, openings: [], shadows: [] };
  const { layers } = arrangedLayers({ model: mdl, d: 200, aOut: 900, type: 'radial', sr: 150, diameter: 10, shape: 'single', first: 80, outerK: 1.5 });
  const top = layers[0].points.filter(p => p.y > 450).map(p => p.x).sort((a, b) => a - b);
  assert.deepEqual(top, [-150, 150]);
  assert.ok(layers[0].points.every(p => !p.fan)); // L1: corner gap (π/2)·80 ≤ 1.5d, no corner lines
  for (const layer of layers) {
    const gap = (Math.PI / 2) * layer.offset;
    const limit = (layer.offset <= 400 ? 1.5 : 2) * 200;
    if (gap <= limit) assert.ok(layer.points.every(p => !p.fan), String(layer.offset));
  }
});

test('auto arrangement: every combination is tried and the passing layout with the least link steel is kept', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const steel = result => result.layout.links.reduce((sum, link) => sum + link.legs.length * Math.PI * link.diameter ** 2 / 4, 0);
  const input = newDefaults();
  input.column = { ...input.column, cx: 300, cy: 450 };
  input.reinforcement = { ...input.reinforcement, enabled: true, arrangement: 'radial', diameter: 10 };
  input.loads = [{ name: 'U', V: 900, Mx: 20, My: 40 }];
  const result = calculateDesign(input);
  assert.equal(result.status, 'Pass', result.notes.join(' | '));
  assert.ok(result.notes.some(n => n.startsWith('Auto arrangement') && n.includes('least link steel')));
  // No single fixed combination that passes uses less steel (Ø-first would have picked Ø12 × 82 here).
  for (const diameter of [10, 12, 16]) for (const extra of [0, 1, 2]) for (const sr of [150, 125, 100]) {
    const fixed = calculateDesign({ ...input, reinforcement: { ...input.reinforcement, diameter, diameterMax: diameter, extra, sr, srAuto: false } });
    // with srAuto false and one Ø the search still adds lines; compare only what passes
    if (fixed.status === 'Pass') assert.ok(steel(result) <= steel(fixed) + 1e-6, `Ø${diameter} +${extra} s_r ${sr}: ${steel(fixed)} < ${steel(result)}`);
  }
  // Unfixable (k_max) ends the search at once.
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.loads = [{ name: 'U', V: 1500, Mx: 0, My: 0 }];
  assert.equal(calculateDesign(input).status, 'Fail');
});

test('auto arrangement at edge and corner columns, with and without a drop: both arrangements pass, s_t ≤ 2d outside u1', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const cases = [
    ['edge', false, 500, 60, -20], ['corner', false, 260, -30, -30],
    ['edge', true, 750, 60, -20], ['corner', true, 325, -30, -30],
  ];
  for (const [position, drop, V, Mx, My] of cases) for (const arrangement of ['grid', 'radial']) {
    const input = newDefaults();
    input.column = { ...input.column, cx: 400, cy: 400, position, x: 3800, y: position === 'corner' ? 3800 : 0 };
    if (drop) input.head = { ...input.head, enabled: true, lx: 2000, ly: 2000, thickness: 400 };
    input.reinforcement = { ...input.reinforcement, enabled: true, arrangement };
    input.loads = [{ name: 'U', V, Mx, My }];
    const result = calculateDesign(input);
    const label = `${position}${drop ? ' + drop' : ''} ${arrangement}`;
    assert.equal(result.status, 'Pass', `${label}: ${result.loads[0].rows.filter(r => r.status === 'Fail').map(r => r.id).join(', ')}`);
    assert.ok(result.notes.some(n => n.includes('least link steel')), label);
  }
});

test('grid ring widening at edge columns and inside / around a drop: fewer links, every check still passes', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const cases = [
    { column: { cx: 400, cy: 400, position: 'edge', x: 3800, y: 0 }, loads: [{ name: 'U', V: 500, Mx: 60, My: -20 }] },
    { column: { cx: 400, cy: 400 }, head: { enabled: true, lx: 2000, ly: 2000, thickness: 400 }, loads: [{ name: 'U', V: 1500, Mx: 20, My: 40 }] },
  ];
  for (const c of cases) {
    const input = newDefaults();
    input.column = { ...input.column, ...c.column };
    if (c.head) input.head = { ...input.head, ...c.head };
    input.loads = c.loads;
    const run = thin => calculateDesign({ ...input, reinforcement: { ...input.reinforcement, enabled: true, arrangement: 'grid', thin } });
    const wide = run(true);
    const dense = run(false);
    assert.equal(wide.status, 'Pass');
    assert.ok(wide.layout.links.length < dense.layout.links.length, `${wide.layout.links.length} vs ${dense.layout.links.length}`);
  }
});

test('radial and grid check the actual first-layer legs (farthest leg ≤ 0.5d)', () => {
  for (const arrangement of ['radial', 'grid']) {
    const input = newDefaults();
    input.reinforcement = { ...input.reinforcement, enabled: true, arrangement };
    const result = calculate(input);
    const first = result.loads[0].rows.find(row => row.id === 'first');
    const legs = result.layout.links.filter(link => link.layerId === 'L1').flatMap(link => link.legs);
    assert.equal(result.status, 'Pass', arrangement);
    assert.equal(first.demand, Math.max(...legs.map(leg => distanceToColumn(input.column, leg))));
    assert.ok(first.demand <= 0.5 * result.section.d);
  }
});
