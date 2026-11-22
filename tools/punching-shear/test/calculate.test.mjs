import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults, restoreInputs } from '../src/inputs.mjs';

const base = () => {
  const input = newDefaults();
  input.beta.confirmed = true;
  return input;
};
const rowOf = (load, id) => load.rows.find(entry => entry.id === id);

test('CSI geometry: u1, v_Rd,c and the k_max cap give a Fail that links cannot resolve', () => {
  const result = calculate(base());
  assert.ok(Math.abs(result.u1 - 5139.468) < 0.01);
  assert.ok(Math.abs(result.resistance.vRdc - 0.5795) < 0.0005);
  const load = result.loads[0];
  assert.ok(Math.abs(load.vEd1 - 1.15 * 1112197 / (5139.468 * 218)) < 1e-6);
  assert.equal(rowOf(load, 'concrete').status, 'Links required');
  assert.equal(rowOf(load, 'max').status, 'Pass');
  assert.equal(rowOf(load, 'kmax').status, 'Fail');
  assert.equal(result.status, 'Fail');
  assert.ok(result.notes[0].includes('Adding links cannot resolve'));
});

test('moderate load: auto layout satisfies every implemented check; anchorage keeps the design at Requires confirmation', () => {
  const input = base();
  input.loads = [{ name: 'ULS', V: 800, Mx: 0, My: 0 }];
  const result = calculate(input);
  const load = result.loads[0];
  assert.equal(load.required, true);
  for (const entry of load.rows) {
    if (entry.id === 'anchorage') assert.equal(entry.status, 'Requires confirmation');
    else assert.ok(['Pass', 'Links required'].includes(entry.status), `${entry.id}: ${entry.status}`);
  }
  assert.equal(result.status, 'Requires confirmation');
  const layers = result.layout.summary;
  assert.ok(layers.length >= 2);
  assert.ok(layers[0].offset <= 0.5 * result.section.d && layers[0].offset >= 0.3 * result.section.d);
  assert.ok(layers.at(-1).offset >= load.aOut - 1.5 * result.section.d);
  assert.ok(layers.every(layer => layer.asw >= load.aswReq - 1e-9));
});

test('no links needed: the design can Pass and reinforcement rows are Not required', () => {
  const input = base();
  input.loads = [{ name: 'Light', V: 300, Mx: 0, My: 0 }];
  const result = calculate(input);
  assert.equal(rowOf(result.loads[0], 'reinforced').status, 'Not required');
  assert.equal(result.layout.links.length, 0);
  assert.equal(result.status, 'Pass');
});

test('maximum stress failure at u0 is reported as Fail', () => {
  const input = base();
  input.loads = [{ name: 'Extreme', V: 5000, Mx: 0, My: 0 }];
  Object.assign(input.slab, { xMin: -20000, xMax: 20000, yMin: -20000, yMax: 20000 });
  const result = calculate(input);
  assert.equal(rowOf(result.loads[0], 'max').status, 'Fail');
  assert.equal(result.status, 'Fail');
});

test('the auto layout envelopes all combinations and the governing combination is reported', () => {
  const input = base();
  input.beta = { method: 'moment' };
  input.loads = [{ name: 'A', V: 700, Mx: 0, My: 0 }, { name: 'B', V: 650, Mx: 0, My: 120 }];
  const result = calculate(input);
  assert.equal(result.governing.ur, Math.max(...result.loads.map(load => load.ur)));
  assert.ok(result.loads.some(load => load.name === result.governing.load && load.ur === result.governing.ur));
  assert.ok(result.layout.summary.every(layer => layer.asw >= Math.max(...result.loads.map(load => load.aswReq)) - 1e-9));
});

test('rotating the column with the loads gives identical β and stresses', () => {
  const a = base();
  a.beta = { method: 'moment' };
  a.loads = [{ name: 'A', V: 700, Mx: 40, My: 90 }];
  const b = structuredClone(a);
  b.column.rotation = 90;
  b.loads = [{ name: 'A', V: 700, Mx: 90, My: -40 }];
  const ra = calculate(a).loads[0];
  const rb = calculate(b).loads[0];
  assert.ok(Math.abs(ra.beta.value - rb.beta.value) < 1e-9);
  assert.ok(Math.abs(ra.vEd1 - rb.vEd1) < 1e-9);
});

test('translating the column and slab together does not change any result', () => {
  const a = base();
  a.loads = [{ name: 'A', V: 800, Mx: 0, My: 0 }];
  const b = structuredClone(a);
  Object.assign(b.column, { x: 5000, y: -3000 });
  Object.assign(b.slab, { xMin: 1000, xMax: 9000, yMin: -7000, yMax: 1000 });
  const ra = calculate(a);
  const rb = calculate(b);
  assert.equal(ra.status, rb.status);
  assert.deepEqual(ra.layout.summary.map(layer => [layer.offset, layer.effectiveLegs]), rb.layout.summary.map(layer => [layer.offset, layer.effectiveLegs]));
});

test('slab edge inside the reinforcement zone is Unsupported geometry, never Pass', () => {
  const input = base();
  input.loads = [{ name: 'A', V: 800, Mx: 0, My: 0 }];
  input.slab.xMax = 700;
  const result = calculate(input);
  assert.equal(result.status, 'Unsupported geometry');
});

test('openings within 6d reduce the perimeters; distant openings are only noted', () => {
  const near = base();
  near.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }];
  near.openings = [{ x: 600, y: 0, w: 200, h: 200 }];
  const reduced = calculate(near);
  assert.ok(reduced.u1 < calculate(base()).u1);
  assert.equal(reduced.shadows.length, 1);
  const far = structuredClone(near);
  far.openings = [{ x: 3000, y: 3000, w: 300, h: 300 }];
  const result = calculate(far);
  assert.equal(result.status, 'Pass');
  assert.ok(result.notes.some(note => note.includes('O1')));
});

test('incomplete and unsupported inputs never give Pass', () => {
  const states = [];
  const edge = base(); edge.column.position = 'edge'; states.push(calculate(edge).status);
  const unconfirmed = base(); unconfirmed.beta.confirmed = false; states.push(calculate(unconfirmed).status);
  const noLoad = base(); noLoad.loads = []; states.push(calculate(noLoad).status);
  const uplift = base(); uplift.loads = [{ name: 'U', V: 0, Mx: 10, My: 0 }]; states.push(calculate(uplift).status);
  const userBeta = base(); userBeta.beta = { method: 'user', userValue: 0.9 }; states.push(calculate(userBeta).status);
  assert.deepEqual(states, ['Incomplete input', 'Incomplete input', 'Incomplete input', 'Unsupported loading', 'Incomplete input']);
});

test('effective depth and flexural area can be derived from bars', () => {
  const input = base();
  Object.assign(input.slab, { depthMode: 'bars', cover: 25 });
  Object.assign(input.flexure, { areaMode: 'bars', phiX: 16, sX: 150, phiY: 12, sY: 200, outer: 'x' });
  const result = calculate(input);
  assert.equal(result.section.dx, 250 - 25 - 8);
  assert.equal(result.section.dy, 250 - 25 - 16 - 6);
  assert.ok(Math.abs(result.section.asx - Math.PI * 64 * 1000 / 150) < 1e-9);
});

test('restore keeps unknown fields and fills new defaults', () => {
  const restored = restoreInputs({ column: { shape: 'circular', diameter: 600, futureField: 7 }, extra: { keep: true } });
  assert.equal(restored.column.futureField, 7);
  assert.equal(restored.column.diameter, 600);
  assert.equal(restored.column.cx, 300);
  assert.deepEqual(restored.extra, { keep: true });
  assert.ok(Array.isArray(restored.loads));
});
