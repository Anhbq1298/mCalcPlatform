import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const sg = edit => {
  const input = newDefaults();
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
  const cenInput = newDefaults();
  cenInput.beta.confirmed = true;
  cenInput.materials.fck = 60;
  cenInput.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }];
  const cen = calculate(cenInput);
  assert.ok(cen.resistance.vRdc > c50.resistance.vRdc);
});

test('Singapore profile stays Not verified until the NA values are confirmed', () => {
  const input = newDefaults();
  input.beta.confirmed = true;
  input.code.profile = 'sg';
  input.loads = [{ name: 'A', V: 200, Mx: 0, My: 0 }];
  assert.equal(calculate(input).status, 'Not verified');
});
