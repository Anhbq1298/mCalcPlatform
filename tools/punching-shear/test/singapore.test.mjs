import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { cenDefaults } from '../src/inputs.mjs';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const sg = edit => {
  const input = cenDefaults();
  input.code = { ...input.code, profile: 'sg', naConfirmed: true };
  input.beta.confirmed = true;
  input.flexure = { ...input.flexure, areaMode: 'explicit', asx: 1090, asy: 1090 }; // ρ = 0.5 % (CSI case)
  edit?.(input);
  return calculate(input);
};

test('CSI SAFE RC-PN-001, Singapore-labelled case: v_Ed, v_Rd,c, D/C and the SG limits', () => {
  // 300 × 900, d = 218, C30, ρ = 0.5 %, V = 1112.197 kN. CSI reports v_Ed ≈ 1.099 MPa (its own moment
  // method), v_Rd,c ≈ 0.5796 MPa and D/C ≈ 1.90. β is back-calculated from the published v_Ed.
  const beta = (1.099 * 5139.468 * 218) / 1112197;
  const result = sg(input => { input.beta = { method: 'user', userValue: beta }; });
  const load = result.loads[0];
  close(load.vEd1, 1.099, 1e-6);
  close(result.resistance.vRdc, 0.5796, 0.0002);
  close(load.vEd1 / result.resistance.vRdc, 1.90, 0.01);
  close(result.vRdMax, 0.5 * 0.6 * (1 - 30 / 250) * 20, 1e-12); // SG NA 6.4.5(3)
  const limit = load.rows.find(row => row.id === 'kmax');
  close(limit.resistance, 2 * result.resistance.vRdc, 1e-12); // v_Ed ≤ 2 v_Rd,c at u1
  assert.equal(limit.status, 'Pass');
});

test('SG NA 3.1.2(2)P: f_ck above C50/60 is capped at 50 MPa for shear', () => {
  const c60 = sg(input => { input.materials.fck = 60; input.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }]; });
  const c50 = sg(input => { input.materials.fck = 50; input.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }]; });
  assert.equal(c60.resistance.vRdc, c50.resistance.vRdc);
  assert.equal(c60.vRdMax, c50.vRdMax);
  assert.ok(c60.notes.some(note => note.includes('C50/60')));
  const cenInput = cenDefaults();
  cenInput.beta.confirmed = true;
  cenInput.materials.fck = 60;
  cenInput.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }];
  const cen = calculate(cenInput);
  assert.ok(cen.resistance.vRdc > c50.resistance.vRdc);
});

test('Singapore profile is the default and gives Pass/Fail directly (values accepted by the user)', async () => {
  const { newDefaults } = await import('../src/inputs.mjs');
  const fresh = newDefaults();
  assert.equal(fresh.code.profile, 'sg');
  assert.equal(fresh.beta.method, 'moment');
  assert.equal(fresh.slab.depthMode, 'bars');
  const input = cenDefaults();
  input.beta.confirmed = true;
  input.code.profile = 'sg';
  input.loads = [{ name: 'A', V: 200, Mx: 0, My: 0 }];
  assert.equal(calculate(input).status, 'Pass');
});

test('slab thickness drives the effective depth and the result (default bar-derived d)', async () => {
  const { newDefaults } = await import('../src/inputs.mjs');
  const at = h => { const input = newDefaults(); input.slab.h = h; return calculate(input); };
  const [thin, thick] = [at(220), at(300)];
  assert.ok(thick.section.d > thin.section.d && thick.loads[0].ur < thin.loads[0].ur);
  const bad = cenDefaults();
  bad.slab.h = 200; // entered d = 218 > h − c
  assert.equal(calculate(bad).status, 'Incomplete input');
});

test('SG compact zone governs auto and provided layouts below the 3d boundary', async () => {
  const { newDefaults } = await import('../src/inputs.mjs');
  const input = newDefaults();
  input.reinforcement.enabled = true;
  input.loads[0].V = 775;
  const auto = calculate(input);
  assert.equal(auto.compactOuterZone, true);
  assert.equal(auto.status, 'Pass');
  assert.deepEqual(auto.layout.layers.map(layer => layer.offset), [80, 230]);
  const farthest = auto.loads[0].rows.find(row => row.id === 'sg-last-max');
  assert.equal(farthest.resistance, 313.5);
  assert.ok(farthest.demand > 230 && farthest.demand <= 313.5);
  assert.ok(auto.loads[0].rows.find(row => row.id === 'sg-first-max').demand <= 104.5);

  input.reinforcement.mode = 'provided';
  input.reinforcement.groups = [80, 150, 150].map(spacing => ({ spacing, st: 100, diameter: 10, shape: 'single' }));
  const provided = calculate(input);
  assert.equal(provided.loads[0].rows.find(row => row.id === 'sg-last-max').status, 'Fail');

  const { d } = auto.section;
  const VAtBoundary = auto.model.intervalsAt(3 * d).total * auto.resistance.vRdc * d / 1000;
  input.loads[0].V = VAtBoundary - 0.001;
  assert.equal(calculate(input).compactOuterZone, true);
  input.loads[0].V = VAtBoundary;
  assert.equal(calculate(input).compactOuterZone, false);
  input.loads[0].V = VAtBoundary + 0.001;
  assert.equal(calculate(input).compactOuterZone, false);
});
