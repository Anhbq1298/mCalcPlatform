import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { detailingChecks } from '../src/detailing.mjs';
import { newDefaults } from '../src/inputs.mjs';

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const square = edit => {
  const input = newDefaults();
  input.beta.confirmed = true;
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.slab = { ...input.slab, h: 240, dx: 200, dy: 200 };
  input.loads = [{ name: 'A', V: 300, Mx: 0, My: 0 }];
  edit?.(input);
  return input;
};
const fullU1 = 1600 + 2 * Math.PI * 400;

test('Fig. 6.14: the sector between the tangents to an opening within 6d is removed from u1', () => {
  const result = calculate(square(input => { input.openings = [{ x: 600, y: 0, w: 200, h: 200 }]; }));
  // u1 side at x = 600; tangents through (500, ±100) cut |y| ≤ 600·100/500 = 120.
  close(result.u1, fullU1 - 240);
});

test('Fig. 6.14: when l1 > l2 the tangential width is replaced by √(l1·l2)', () => {
  const result = calculate(square(input => { input.openings = [{ x: 900, y: 0, w: 600, h: 100 }]; }));
  const half = Math.sqrt(600 * 100) / 2; // replacement width 244.9 mm, radial extent 600 → 1200
  close(result.u1, fullU1 - 2 * 600 * (half / 600));
  assert.ok(result.shadows[0].replaced);
});

test('openings beyond 6d do not reduce u1; moment β with a reduced perimeter is Not verified', () => {
  const far = calculate(square(input => { input.openings = [{ x: 2500, y: 0, w: 200, h: 200 }]; }));
  close(far.u1, fullU1);
  const moment = calculate(square(input => {
    input.openings = [{ x: 600, y: 0, w: 200, h: 200 }];
    input.beta = { method: 'moment' };
    input.loads = [{ name: 'A', V: 300, Mx: 0, My: 30 }];
  }));
  assert.equal(moment.status, 'Not verified');
});

test('links in an opening shadow are not placed; layers carry legs only on effective parts', () => {
  const result = calculate(square(input => { input.openings = [{ x: 600, y: 0, w: 200, h: 200 }]; input.loads = [{ name: 'A', V: 600, Mx: 0, My: 0 }]; }));
  for (const link of result.layout.links) for (const leg of link.legs) {
    const angle = Math.atan2(leg.y, leg.x);
    assert.ok(Math.abs(angle) > Math.atan(100 / 500) - 1e-9 || !leg.effective);
  }
});

test('σ_cp adds k1·σ_cp to v_Rd,c and to its lower bound (Eq. 6.47)', () => {
  const plain = calculate(square()).resistance;
  const compressed = calculate(square(input => { input.prestress = { sigmaX: 2, sigmaY: 1 }; })).resistance;
  close(compressed.vRdc - plain.vRdc, 0.1 * 1.5, 1e-12);
});

test('detailing: slab depth, mandrel, hook extension, fit and engagement confirmation', () => {
  const slab = { h: 250, cover: 25 };
  const ok = detailingChecks({ slab, anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: true }, diameters: [10, 12] });
  assert.equal(ok.status, 'Pass');
  const thin = detailingChecks({ slab: { h: 180, cover: 25 }, anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: true }, diameters: [10] });
  assert.equal(thin.rows.find(row => row.id === 'depth').status, 'Fail');
  const bend = detailingChecks({ slab, anchorage: { type: 'bend', mandrelFactor: 4, extension: 90, engaged: true }, diameters: [10] });
  assert.equal(bend.rows.find(row => row.id === 'extension-10').status, 'Fail'); // needs max(10φ, 70) = 100
  const big = detailingChecks({ slab, anchorage: { type: 'hook', mandrelFactor: 4, extension: 120, engaged: true }, diameters: [20] });
  assert.equal(big.rows.find(row => row.id === 'mandrel-20').status, 'Fail'); // needs 7φ for φ > 16
  const unconfirmed = detailingChecks({ slab, anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: false }, diameters: [10] });
  assert.equal(unconfirmed.status, 'Requires confirmation');
});

test('UK profile uses 0.5·ν·f_cd and 2·v_Rd,c, and stays Not verified until confirmed', () => {
  const uk = square(input => { input.code.profile = 'uk'; input.loads = [{ name: 'A', V: 200, Mx: 0, My: 0 }]; });
  const result = calculate(uk);
  close(result.vRdMax, 0.5 * 0.6 * (1 - 30 / 250) * 20, 1e-12);
  assert.equal(result.status, 'Not verified');
  uk.code.naConfirmed = true;
  assert.equal(calculate(uk).status, 'Pass');
});

test('Dlubal VE 1028 circular column: u1, v_Ed, k, v_Rd,c and v_min (CEN-independent quantities)', () => {
  const input = newDefaults();
  input.column = { ...input.column, shape: 'circular', diameter: 300 };
  input.slab = { ...input.slab, h: 240, dx: 210, dy: 210 };
  input.flexure = { ...input.flexure, asx: 1050, asy: 1050 };
  input.beta = { method: 'user', userValue: 1.1 };
  input.loads = [{ name: 'VE1028', V: 500, Mx: 0, My: 0 }];
  const result = calculate(input);
  close(result.u1 / 1000, 3.581, 0.0005);
  close(result.loads[0].vEd1, 0.731, 0.0005);
  close(result.resistance.k, 1.976, 0.0005);
  close(result.resistance.vRdc, 0.585, 0.0005);
  close(result.resistance.vMin, 0.532, 0.0005);
});
