import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
// 400 (x) × 300 (y) column, d = 200 mm, flush with slab edge X max at 4000 → c1 = 400 (⊥ edge), c2 = 300.
const edgeInput = edit => {
  const input = newDefaults();
  input.beta.confirmed = true;
  input.column = { ...input.column, position: 'edge', cx: 400, cy: 300, x: 3800, y: 0 };
  input.slab = { ...input.slab, h: 240, dx: 200, dy: 200 };
  input.loads = [{ name: 'A', V: 500, Mx: 0, My: 0 }];
  edit?.(input);
  return input;
};

test('edge column perimeters follow Fig. 6.15, Fig. 6.20 and §6.4.5(3)', () => {
  const result = calculate(edgeInput());
  assert.equal(result.position.kind, 'edge');
  close(result.u1, 2 * 400 + 300 + 2 * Math.PI * 200); // clipped path = 2c1 + c2 + 2πd
  close(result.u1Star, 2 * Math.min(300, 200) + 300 + 2 * Math.PI * 200, 1e-9);
  close(result.u0, Math.min(300 + 600, 300 + 800), 1e-9);
  assert.equal(result.loads[0].beta.value, 1.4);
});

test('edge β: u1/u1* toward the interior, Eq. 6.44 with e_par, unsupported toward the edge', () => {
  const inward = calculate(edgeInput(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 500, Mx: 0, My: -50 }]; }));
  const u1 = 1100 + 400 * Math.PI;
  const u1Star = 700 + 400 * Math.PI;
  close(inward.loads[0].beta.value, u1 / u1Star, 1e-6);
  const both = calculate(edgeInput(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 500, Mx: 40, My: -50 }]; }));
  const k = 0.45 + ((400 / 600 - 0.5) / 0.5) * 0.15; // Table 6.1 with c1/2c2
  const W1 = 300 ** 2 / 4 + 400 * 300 + 4 * 400 * 200 + 8 * 200 ** 2 + Math.PI * 200 * 300; // Eq. 6.45
  close(both.loads[0].beta.value, u1 / u1Star + (k * 80 * u1) / W1, 1e-6);
  const outward = calculate(edgeInput(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 500, Mx: 0, My: 50 }]; }));
  assert.equal(outward.status, 'Unsupported loading');
});

test('corner column perimeters, β = u1/u1* and the simplified 1.5', () => {
  const corner = edit => edgeInput(input => { input.column = { ...input.column, position: 'corner', y: 3850 }; edit?.(input); });
  const result = calculate(corner());
  assert.equal(result.position.kind, 'corner');
  close(result.u1, 700 + Math.PI * 200);
  close(result.u1Star, 200 + 150 + Math.PI * 200, 1e-9);
  close(result.u0, 600, 1e-9);
  assert.equal(result.loads[0].beta.value, 1.5);
  const moment = calculate(corner(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 400, Mx: -20, My: -30 }]; }));
  close(moment.loads[0].beta.value, result.u1 / result.u1Star, 1e-6);
  const outward = calculate(corner(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 400, Mx: 20, My: -30 }]; }));
  assert.equal(outward.status, 'Unsupported loading');
});

test('edge column links lie on the clipped layers and the design can be completed', () => {
  const result = calculate(edgeInput(input => {
    input.loads = [{ name: 'A', V: 290, Mx: 0, My: 0 }];
    input.reinforcement.anchorage = { type: 'hook', mandrelFactor: 4, extension: 75, engaged: true };
  }));
  assert.ok(result.loads[0].required);
  assert.ok(result.layout.links.every(link => link.legs.every(leg => leg.x <= 4000 + 1e-6)));
  assert.ok(result.layout.summary.every(layer => layer.effectiveLegs === layer.legs));
  assert.equal(result.status, 'Pass');
});

test('position must match the geometry; rotated or circular edge columns are unsupported', () => {
  const mismatch = calculate(edgeInput(input => { input.column.position = 'internal'; }));
  assert.equal(mismatch.status, 'Incomplete input');
  assert.match(mismatch.issues[0].message, /edge column/);
  const rotated = calculate(edgeInput(input => { input.column.rotation = 30; input.column.x = 4000 - (200 * Math.cos(Math.PI / 6) + 150 * Math.sin(Math.PI / 6)); }));
  assert.equal(rotated.status, 'Unsupported geometry');
  const round = calculate(edgeInput(input => { input.column = { ...input.column, shape: 'circular', diameter: 400, x: 3800 }; }));
  assert.equal(round.status, 'Unsupported geometry');
  const setback = calculate(edgeInput(input => { input.column.position = 'internal'; input.column.x = 3500; }));
  assert.equal(setback.status, 'Unsupported geometry');
});
