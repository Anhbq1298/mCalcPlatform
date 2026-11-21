import assert from 'node:assert/strict';
import test from 'node:test';
import { concreteResistance, fywdEffective, maximumResistance, outerPerimeterLength, requiredAswPerPerimeter, reinforcementRatio, sizeEffect } from '../src/resistance.mjs';

test('size effect k is capped at 2.0 and follows 1 + √(200/d)', () => {
  assert.ok(Math.abs(sizeEffect(218) - (1 + Math.sqrt(200 / 218))) < 1e-12);
  assert.equal(sizeEffect(50), 2);
});

test('concrete resistance for fck 30, d 218, ρ 0.5 % matches hand calculation (Eq. 6.47)', () => {
  const r = concreteResistance({ fck: 30, d: 218, rhoX: 0.005, rhoY: 0.005 });
  // 0.12 · 1.9578 · (100 · 0.005 · 30)^(1/3) = 0.5795; the Singapore-labelled CSI example reports 0.5796.
  assert.ok(Math.abs(r.vRdc - 0.5795) < 0.0005, `got ${r.vRdc}`);
  assert.ok(r.vRdc > r.vMin);
});

test('minimum resistance governs for very low reinforcement ratios', () => {
  const r = concreteResistance({ fck: 30, d: 218, rhoX: 0.0001, rhoY: 0.0001 });
  assert.ok(Math.abs(r.vRdc - r.vMin) < 1e-12);
});

test('reinforcement ratio is capped at 2 % and uses area per metre over depth', () => {
  assert.ok(Math.abs(reinforcementRatio(1090, 218) - 0.005) < 1e-12);
  assert.equal(reinforcementRatio(1e6, 218), 0.02);
});

test('maximum punching stress uses CEN 0.4·ν·fcd (AC:2010), ν = 0.6(1 − fck/250)', () => {
  assert.ok(Math.abs(maximumResistance({ fck: 30 }) - 4.224) < 1e-9);
});

test('effective link strength is limited to 250 + 0.25d and to fyk/γs', () => {
  assert.ok(Math.abs(fywdEffective(500, 218) - (250 + 54.5)) < 1e-12);
  assert.ok(Math.abs(fywdEffective(250, 1000) - 250 / 1.15) < 1e-12);
});

test('required Asw per perimeter follows Eq. 6.52 rearranged; zero when vEd ≤ 0.75·vRd,c', () => {
  assert.equal(requiredAswPerPerimeter({ vEd: 0.4, vRdc: 0.6, u1: 5000, sr: 150, fywdEf: 300 }), 0);
  const asw = requiredAswPerPerimeter({ vEd: 1.1, vRdc: 0.6, u1: 4000, sr: 150, fywdEf: 300 });
  assert.ok(Math.abs(asw - (1.1 - 0.45) * 4000 * 150 / (1.5 * 300)) < 1e-9);
});

test('Dlubal VE 1023 cross-check: base Asw from the published vEd and vRd,c with CEN fywd,ef', () => {
  // Published: vEd = 1.088, vRd,c = 0.929, u1 = 4188 mm, d = 190 mm, sr = 0.75d.
  // Dlubal reports 4.98 cm² using its German-NA settings; this gives 5.23 cm² under CEN recommended values.
  const asw = requiredAswPerPerimeter({ vEd: 1.088, vRdc: 0.929, u1: 4188, sr: 0.75 * 190, fywdEf: fywdEffective(500, 190) });
  assert.ok(Math.abs(asw / 100 - 5.23) < 0.05, `got ${asw / 100} cm²`);
});

test('outer perimeter length follows Eq. 6.54 with β applied once', () => {
  assert.ok(Math.abs(outerPerimeterLength({ beta: 1.1, V: 1000, vRdc: 0.5, d: 200 }) - 11000) < 1e-9);
});
