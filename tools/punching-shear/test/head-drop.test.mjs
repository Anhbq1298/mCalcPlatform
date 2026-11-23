import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDesign } from '../src/head.mjs';
import { STATES } from '../src/inputs.mjs';

const close = (actual, expected, tol = 1e-6) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected}`);
const base = (head, extra = {}) => ({
  beta: { method: 'simplified', confirmed: true }, reinforcement: { anchorage: { engaged: true } },
  column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 },
  slab: { h: 250, depthMode: 'explicit', dx: 215, dy: 205, cover: 25, xMin: -6000, xMax: 6000, yMin: -6000, yMax: 6000 },
  flexure: { areaMode: 'explicit', asx: 1340, asy: 1340 }, loads: [{ name: 'ULS 1', V: 700, Mx: 0, My: 0 }],
  head: { enabled: true, shape: 'rectangular', ...head }, ...extra,
});


test('drop sized from the column: l_H on every side; old saves keep their absolute size', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults, restoreInputs } = await import('../src/inputs.mjs');
  const input = newDefaults();
  assert.equal(input.head.sizeMode, 'column');
  input.column = { ...input.column, cx: 300, cy: 900 };
  input.head = { ...input.head, enabled: true, offset: 300 };
  const restored = restoreInputs(input);
  assert.deepEqual([restored.head.lx, restored.head.ly], [900, 1500]);
  const absolute = calculateDesign({ ...input, head: { ...input.head, sizeMode: 'absolute', lx: 900, ly: 1500 } });
  assert.equal(calculateDesign(input).governing.ur, absolute.governing.ur);
  const circular = restoreInputs({ ...input, column: { shape: 'circular', diameter: 500 } });
  assert.deepEqual([circular.head.shape, circular.head.diameter], ['circular', 1100]);
  const old = restoreInputs({ head: { enabled: true, shape: 'rectangular', lx: 2000, ly: 1800, thickness: 400 } });
  assert.deepEqual([old.head.sizeMode, old.head.lx, old.head.ly], ['absolute', 2000, 1800]);
});

test('mixed rectangular head: composite inner section by normal direction (faces and corner arcs)', () => {
  const input = base({ lx: 1300, ly: 1300, depth: 150 }, { column: { shape: 'rectangular', position: 'internal', cx: 300, cy: 900, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 900, Mx: 0, My: 0 }] });
  const result = calculateDesign(input);
  const row = result.loads[0].rows.find(entry => entry.id === 'concrete');
  assert.ok(row.label.includes('composite'));
  // x faces: l_H = 500 ≥ 300 (inner, column face 900 each); y faces: l_H = 200 < 300 (slab side 1300 each).
  // Corners: the head reaches min(500/cos φ, 200/sin φ) ≥ 300 for φ ≤ asin(2/3): inner arc there, slab arc beyond.
  const d = 210, dH = 360, phi = Math.asin(2 / 3);
  const uLong = 2 * 900 + 4 * 2 * dH * phi;
  const uRest = 2 * 1300 + 4 * 2 * d * (Math.PI / 2 - phi);
  const { composite } = result.head;
  close(composite.uLong, uLong, 0.01 * uLong);
  close(composite.uRest, uRest, 0.01 * uRest);
  close(row.demand, (1.15 * 900e3) / (composite.uLong * dH + composite.uRest * d), 1e-9);
  const large = calculateDesign(base({ lx: 1500, ly: 1500, depth: 150 }, { column: input.column, loads: input.loads }));
  assert.ok(!large.loads[0].rows.find(entry => entry.id === 'concrete').label.includes('composite'));
});

test('drop growing in both directions: the unreinforced UR does not jump up from Fig. 6.17 to the composite section', () => {
  const ur = (lx, ly) => Math.max(...calculateDesign(base({ lx, ly, depth: 150 }, { column: { shape: 'rectangular', position: 'internal', cx: 300, cy: 900, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 1000, Mx: 0, My: 0 }] }))
    .loads[0].rows.filter(row => /concrete$/.test(row.id)).map(row => row.ur));
  assert.ok(ur(900, 1400) <= ur(700, 1400) + 1e-9); // Fig. 6.17 → composite (x faces reach 2h_H)
  assert.ok(ur(700, 1500) <= ur(700, 1400) + 1e-9); // Fig. 6.17 → composite (y faces reach 2h_H)
});

test('mixed rectangular head needing links: composite section with links passes; the long parts are drawn', async () => {
  const { planSvg } = await import('../src/plan-view.mjs');
  const input = base({ lx: 1300, ly: 1300, depth: 150 }, { column: { shape: 'rectangular', position: 'internal', cx: 300, cy: 900, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 1300, Mx: 0, My: 0 }] });
  input.reinforcement = { ...input.reinforcement, enabled: true, mode: 'auto' };
  const result = calculateDesign(input);
  const rows = result.loads[0].rows;
  assert.equal(rows.find(entry => entry.id === 'concrete').status, STATES.linksRequired);
  const reinforced = rows.find(entry => entry.id === 'reinforced');
  assert.ok(reinforced.label.includes('composite') && reinforced.status === STATES.pass, reinforced.detail);
  assert.ok(result.layout.links.length > 0);
  assert.deepEqual(result.head.composite.long.sort(), ['xMax', 'xMin']);
  assert.ok(planSvg(result).includes('composite'));
});

test('drop from the column at l_H = 2h_H: the inner section is carried by the slab links within 2d_H (no Fail for lack of room)', () => {
  for (const cy of [300, 450, 600]) {
    const input = base({}, { column: { shape: 'rectangular', position: 'internal', cx: 300, cy, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 1112, Mx: 0, My: 0 }] });
    input.head = { enabled: true, sizeMode: 'column', offset: 300, thickness: 400 };
    input.reinforcement = { ...input.reinforcement, enabled: true, mode: 'auto' };
    const result = calculateDesign(input);
    assert.equal(result.status, STATES.pass, `300×${cy}`);
    const row = result.loads[0].rows.find(entry => entry.id === 'reinforced');
    assert.ok(row.detail.includes('cross this crack'), row.detail);
  }
});
