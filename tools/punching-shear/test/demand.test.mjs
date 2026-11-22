import assert from 'node:assert/strict';
import test from 'node:test';
import { basicPerimeter, sectionModulusCircular, sectionModulusRect } from '../src/geometry.mjs';
import { betaMomentUniaxial, kInternalRect, shearDemand } from '../src/demand.mjs';

const rect = (cx, cy) => ({ shape: 'rectangular', position: 'internal', cx, cy });
const circ = diameter => ({ shape: 'circular', position: 'internal', diameter });

test('Table 6.1 k values at tabulated ratios and interpolated ratios, clamped outside the table', () => {
  assert.equal(kInternalRect(300, 300), 0.6);
  assert.equal(kInternalRect(150, 300), 0.45);
  assert.equal(kInternalRect(600, 300), 0.7);
  assert.equal(kInternalRect(900, 300), 0.8);
  assert.equal(kInternalRect(1200, 300), 0.8);
  assert.ok(Math.abs(kInternalRect(450, 300) - 0.65) < 1e-12);
});

test('Dlubal VE 1023 demand: β = 1.10, V = 787.3 kN, u1 ≈ 4.188 m, d = 190 mm gives vEd ≈ 1.088 MPa', () => {
  const u1 = basicPerimeter(rect(450, 450), 190);
  const vEd = shearDemand({ V: 787.3, beta: 1.10, u: u1, d: 190 });
  assert.ok(Math.abs(vEd - 1.088) < 0.001, `got ${vEd}`);
});

test('uniaxial rectangular β follows 1 + k·(M/V)·u1/W1 with k from Table 6.1', () => {
  const column = rect(300, 900);
  const d = 218;
  const V = 1000;
  const M = 200;
  const u1 = basicPerimeter(column, d);
  const w1 = sectionModulusRect(300, 900, d);
  const k = kInternalRect(300, 900);
  const expected = 1 + k * ((M / V) * 1000) * u1 / w1;
  // Moment My produces eccentricity along x, so c1 = cx = 300.
  assert.ok(Math.abs(betaMomentUniaxial(column, d, V, M, 'x') - expected) < 1e-12);
});

test('circular β equals 1 + 0.6π·e/(D + 4d) (Eq. 6.42 form)', () => {
  const column = circ(500);
  const d = 200;
  const V = 800;
  const M = 160;
  const e = (M / V) * 1000;
  assert.ok(Math.abs(betaMomentUniaxial(column, d, V, M) - (1 + 0.6 * Math.PI * e / (500 + 4 * d))) < 1e-12);
  const u1 = basicPerimeter(column, d);
  assert.ok(Math.abs(betaMomentUniaxial(column, d, V, M) - (1 + 0.6 * e * u1 / sectionModulusCircular(500, d))) < 1e-12);
});

test('zero moment gives β = 1, and a 90° rotation of the column with its moment axis gives the same β', () => {
  assert.equal(betaMomentUniaxial(rect(300, 900), 218, 1000, 0, 'x'), 1);
  const a = betaMomentUniaxial(rect(300, 900), 218, 1000, 150, 'x');
  const b = betaMomentUniaxial(rect(900, 300), 218, 1000, 150, 'y');
  assert.ok(Math.abs(a - b) < 1e-12);
});

import { betaMoment, localEccentricities } from '../src/demand.mjs';

test('betaMoment reduces to Eq. 6.39 for a single moment, with M_y giving eccentricity along x', () => {
  const column = { shape: 'rectangular', cx: 300, cy: 900, rotation: 0 };
  assert.ok(Math.abs(betaMoment(column, 218, 1000, 0, 200).value - betaMomentUniaxial(column, 218, 1000, 200, 'x')) < 1e-12);
  assert.ok(Math.abs(betaMoment(column, 218, 1000, 200, 0).value - betaMomentUniaxial(column, 218, 1000, 200, 'y')) < 1e-12);
});

test('Eq. 6.43 biaxial: square columns give the same β for both pairings; rectangles take the larger', () => {
  const square = betaMoment({ shape: 'rectangular', cx: 400, cy: 400, rotation: 0 }, 200, 800, 60, 80);
  assert.ok(Math.abs(square.terms.betaParallel - square.terms.betaCrossed) < 1e-12);
  const b = 400 + 800;
  assert.ok(Math.abs(square.value - (1 + 1.8 * Math.hypot(100 / b, 75 / b))) < 1e-12);
  const rect = betaMoment({ shape: 'rectangular', cx: 300, cy: 900, rotation: 0 }, 218, 800, 60, 80);
  assert.equal(rect.value, Math.max(rect.terms.betaParallel, rect.terms.betaCrossed));
  assert.ok(rect.terms.betaParallel !== rect.terms.betaCrossed);
});

test('circular biaxial β uses the resultant eccentricity and is independent of moment direction', () => {
  const column = { shape: 'circular', diameter: 500, rotation: 0 };
  const a = betaMoment(column, 200, 800, 0, 100).value;
  const b = betaMoment(column, 200, 800, 60, 80).value;
  assert.ok(Math.abs(a - b) < 1e-12);
});

test('local eccentricities follow the column rotation', () => {
  const { e1, e2 } = localEccentricities({ rotation: 90 }, 1000, 0, 100);
  assert.ok(Math.abs(e1) < 1e-9 && Math.abs(e2 + 100) < 1e-9);
});
