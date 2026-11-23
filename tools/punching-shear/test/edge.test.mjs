import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { calculateDesign } from '../src/head.mjs';
import { exampleById } from '../src/examples.mjs';
import { cenDefaults } from '../src/inputs.mjs';

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
// 400 (x) × 300 (y) column, d = 200 mm, flush with slab edge X max at 4000 → c1 = 400 (⊥ edge), c2 = 300.
const edgeInput = edit => {
  const input = cenDefaults();
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

test('rectangular setbacks return to the slab edge and use the shortest perimeter', () => {
  const run = (x, y) => calculate(edgeInput(input => {
    input.slab.xMax += x;
    if (y !== null) {
      input.column.position = 'corner';
      input.slab.yMax = input.column.cy / 2 + y;
    }
    input.loads[0].V = 120;
  }));
  const edge = run(75, null);
  const corner = run(75, 125);
  const oneEdge = run(75, 1300);
  const interior = run(1000, null);
  for (const [result, kind, u1, beta] of [
    [edge, 'edge', 2 * (400 + 75) + 300 + 400 * Math.PI, 1.4],
    [corner, 'corner', 400 + 75 + 300 + 125 + 200 * Math.PI, 1.5],
    [oneEdge, 'edge', 2 * (400 + 75) + 300 + 400 * Math.PI, 1.4],
    [interior, 'internal', 2 * (400 + 300) + 800 * Math.PI, 1.15],
  ]) {
    assert.equal(result.status, 'Pass');
    assert.equal(result.position.kind, kind);
    close(result.u1, u1);
    close(result.model.intervalsAt(400).total, u1);
    close(result.loads[0].vEd1, beta * 120000 / (u1 * 200), 1e-9);
  }
  close(edge.u0, 900, 1e-9);
  close(corner.u0, 600, 1e-9);
  assert.match(edge.notes.join(' '), /special slab-edge reinforcement/);
});

test('a setback drop checks both the inner section and the perimeter around the clipped drop', () => {
  for (const [id, corner] of [['edge-drop', false], ['corner-drop', true]]) {
    const input = structuredClone(exampleById(id).input);
    input.slab.xMax += 75;
    if (corner) input.slab.yMax += 150;
    input.loads[0].V = 120;
    const result = calculateDesign(input);
    assert.equal(result.status, 'Pass');
    const [inner, outer] = result.head.sections;
    const innerExpected = corner ? 575 + 650 + Math.PI * 360 : 2 * 575 + 500 + 2 * Math.PI * 360;
    const outerExpected = corner ? 1525 + 1600 + Math.PI * 210 : 2 * 1525 + 2400 + 2 * Math.PI * 210;
    close(inner.u1, innerExpected);
    close(outer.u1, outerExpected);
    input.loads[0].V = 1000;
    const high = calculateDesign(input);
    assert.equal(high.status, 'Unsupported geometry');
    assert.equal(high.loads.length, 1);
    close(high.head.sections[0].u1, innerExpected);
    close(high.head.sections[1].u1, outerExpected);
    assert.equal(high.layout.layers.length, 0);
  }
});

test('setback moment and link design limits stay explicit', () => {
  const moment = calculate(edgeInput(input => { input.slab.xMax += 75; input.beta.method = 'moment'; }));
  assert.equal(moment.issues[0].code, 'set-back-beta');
  const reinforced = calculate(edgeInput(input => { input.slab.xMax += 75; }));
  assert.ok(reinforced.loads[0].required);
  assert.equal(reinforced.status, 'Unsupported geometry');
  assert.equal(reinforced.layout.layers.length, 0);
});
