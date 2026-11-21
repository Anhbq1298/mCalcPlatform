import test from 'node:test';
import assert from 'node:assert/strict';
import { checkColumnShear, shearDefaults } from '../src/shear.mjs';
import { solveColumn } from '../src/solver.worker.mjs';

const bars = [];
const area = Math.PI * 25 ** 2 / 4;
for (const y of [-337.5, 337.5]) {
  for (let i = 0; i < 4; i++) bars.push({ x: -187.5 + 125 * i, y, area });
}
for (const x of [-187.5, 187.5]) {
  for (let i = 1; i < 5; i++) bars.push({ x, y: -337.5 + 135 * i, area });
}
const section = { b: 500, h: 800, link: 10, fc: 35, fy: 500, es: 200000, bars };
const links = { ...shearDefaults, enabled: true, legsX: 4, legsY: 2 };
const load = { name: 'Template ULS', p: 3000, vx: 200, vy: 400 };
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

function y(overrides = {}, linkOverrides = {}, sectionOverrides = {}) {
  return checkColumnShear({ ...section, ...sectionOverrides }, { ...links, ...linkOverrides }, [{ ...load, ...overrides }])[1];
}

test('matches the Canvas rectangular column shear reference and links capacity', () => {
  const result = y();
  near(result.tau, 1.2053, 0.0001);
  near(result.linksCapacity, 755.5, 0.2);
  near(result.ratio, 400 / 755.5, 0.001);
  assert.equal(result.cot, 2.5);
  assert.equal(result.governs, 'Links');
  assert.equal(y({ vy: -400 }).ratio, result.ratio);
});

test('covers axial tension, shallow compression, class A, strut limit and zero shear', () => {
  near(y({ p: -500 }).upperCot, 2.375, 1e-8);
  assert.equal(y({ p: -3000, vy: 100 }).upperCot, 1);
  assert.equal(y({}, { classA: true }).upperCot, 2);
  assert.equal(y({ vy: 0 }).ratio, 0);
  const smallerBars = bars.map(bar => ({ ...bar, area: Math.PI * 16 ** 2 / 4 }));
  assert.equal(y({ p: 1280 }, {}, { fc: 60, bars: smallerBars }).upperCot, 3);
  near(y({ p: 300 }, {}, { fc: 60, bars: smallerBars }).upperCot, 2.625, 1e-8);
  const strut = y({ vy: 1400 });
  near(strut.strutCapacity, 1400, 1e-7);
  assert.ok(strut.cot < strut.upperCot);
  assert.equal(y({ vy: 3000 }).cot, 1);
  assert.ok(y({ p: 100000 }).error);
  assert.throws(() => y({}, { spacing: 0 }), /valid link/);
});

test('runs the copied local solver and returns directional shear with the PMM result', () => {
  const result = solveColumn('analyse', {
    section, concrete: { fc: section.fc }, steel: { fy: section.fy, es: section.es },
    settings: { fiberCountX: 12, fiberCountY: 12 },
    demands: [{ name: 'ULS', pu: 3000000, mux: 600e6, muy: 300e6 }],
    shear: { diameter: 10, links, loads: [load] },
  });
  assert.ok(result.mesh.xyz instanceof Float32Array);
  assert.equal(result.results.length, 1);
  assert.equal(result.shear.length, 2);
  near(result.shear[1].ratio, 400 / 755.5, 0.001);
  assert.ok(solveColumn('creep', { rh: 50, t0: 28, h0: 300, fcm: 43, cement: 'N' }).phiInf > 0);
});
