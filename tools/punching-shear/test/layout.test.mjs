import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';
import { buildLinks, layerSummary, tangentialGaps } from '../src/layout.mjs';
import { perimeterAtOffset } from '../src/geometry.mjs';
import { effectiveIntervals } from '../src/perimeters.mjs';

const model = () => {
  const m = { column: { shape: 'rectangular', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, slab: { xMin: -3000, xMax: 3000, yMin: -3000, yMax: 3000 }, openings: [], shadows: [], legGap: 100 };
  m.intervalsAt = r => effectiveIntervals(m, r);
  return m;
};
const provided = layers => {
  const input = newDefaults();
  input.beta.confirmed = true;
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.loads = [{ name: 'A', V: 700, Mx: 0, My: 0 }];
  input.reinforcement = { mode: 'provided', diameter: 10, shape: 'single', legGap: 100, layers };
  return calculate(input);
};

test('links and legs are counted separately; two-leg links contribute two effective legs', () => {
  const links = buildLinks(model(), [{ offset: 100, diameter: 10, shape: 'double', links: 8, start: 0, omitted: [] }], 'user');
  assert.equal(links.length, 8);
  const summary = layerSummary(model(), [{ offset: 100, diameter: 10, shape: 'double', links: 8 }], links)[0];
  assert.equal(summary.physicalLinks, 8);
  assert.equal(summary.legs, 16);
  assert.equal(summary.effectiveLegs, 16);
  assert.ok(Math.abs(summary.asw - 16 * Math.PI * 25) < 1e-9);
});

test('a layer clipped by a slab edge carries links only on its effective length', () => {
  const m = model();
  m.slab.xMax = 250;
  const layers = [{ offset: 100, diameter: 10, shape: 'single', links: 8, start: 0, omitted: [] }];
  const summary = layerSummary(m, layers, buildLinks(m, layers, 'user'))[0];
  assert.ok(summary.u < perimeterAtOffset(m.column, 100) - 1);
  assert.equal(summary.effectiveLegs, summary.legs);
  assert.equal(summary.legs, 8);
  // A two-leg link centred near the end of an interval puts one leg outside the slab.
  const wide = [{ offset: 100, diameter: 10, shape: 'double', links: 1, start: 0, omitted: [] }];
  m.legGap = 1800;
  const outside = layerSummary(m, wide, buildLinks(m, wide, 'user'))[0];
  assert.ok(outside.ineffective.some(leg => leg.reason === 'Outside slab'));
});

test('tangential gaps sum to the layer perimeter and detect an omitted link', () => {
  const layers = [{ offset: 100, diameter: 10, shape: 'single', links: 12, start: 0, omitted: [3] }];
  const links = buildLinks(model(), layers, 'user');
  const u = perimeterAtOffset(model().column, 100);
  const gaps = tangentialGaps(links, model().intervalsAt(100));
  assert.ok(Math.abs(gaps.gaps.reduce((sum, gap) => sum + gap.length, 0) - u) < 1e-9);
  assert.ok(Math.abs(gaps.max - 2 * u / 12) < 1e-9);
});

test('check-provided mode does not move links and reports radial, tangential and outer failures', () => {
  const result = provided([
    { offset: 150, diameter: 10, shape: 'single', links: 8, start: 0, omitted: [] },
    { offset: 400, diameter: 10, shape: 'single', links: 8, start: 0, omitted: [] },
  ]);
  const rows = Object.fromEntries(result.loads[0].rows.map(entry => [entry.id, entry.status]));
  assert.equal(rows.first, 'Fail');
  assert.equal(rows.radial, 'Fail');
  assert.equal(rows.tangential, 'Fail');
  assert.deepEqual(result.layout.layers.map(layer => layer.offset), [150, 400]);
  assert.equal(result.status, 'Fail');
});

test('different diameters per layer: Eq. 6.52 uses the smallest layer A_sw', () => {
  const result = provided([
    { offset: 80, diameter: 12, shape: 'single', links: 24, start: 0, omitted: [] },
    { offset: 230, diameter: 8, shape: 'single', links: 24, start: 0, omitted: [] },
  ]);
  const reinforced = result.loads[0].rows.find(entry => entry.id === 'reinforced');
  assert.ok(Math.abs(reinforced.aswMin - 24 * Math.PI * 16) < 1e-9);
});

test('layer offsets out of order are rejected rather than reordered', () => {
  const result = provided([
    { offset: 230, diameter: 10, shape: 'single', links: 20, start: 0, omitted: [] },
    { offset: 80, diameter: 10, shape: 'single', links: 20, start: 0, omitted: [] },
  ]);
  assert.notEqual(result.status, 'Pass');
  assert.equal(result.loads[0].rows.find(entry => entry.id === 'radial').status, 'Fail');
});

test('auto layout reports a reason when two-leg links cannot fit the layer', () => {
  const input = newDefaults();
  input.beta.confirmed = true;
  input.loads = [{ name: 'A', V: 800, Mx: 0, My: 0 }];
  input.reinforcement = { mode: 'auto', diameter: 10, shape: 'double', legGap: 2000, layers: [] };
  const result = calculate(input);
  assert.match(result.layout.reason, /No valid link count/);
  assert.equal(result.status, 'Fail');
});
