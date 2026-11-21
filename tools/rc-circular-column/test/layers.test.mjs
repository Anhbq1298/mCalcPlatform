import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, newDefaults, newLayer, linkGeometry, linkChecks, restoreInputs, validateInputs } from '../src/inputs.mjs';

test('D1000 keeps each hoop tangent to its longitudinal bars and reserves the radial clear distance', () => {
  const values = { ...newDefaults(), diameter: 1000 };
  values.layers.push(newLayer(1), newLayer(2));
  const rings = linkGeometry(values);
  assert.deepEqual(rings.map(ring => ring.barRadius), [389, 328.5, 278.5]);
  assert.equal(rings[1].radialClear, 32);
  for (const ring of rings) assert.equal(ring.linkRadius - ring.link / 2, ring.barRadius + ring.bar / 2);
  assert.equal(500 - rings[0].linkRadius - rings[0].link / 2, values.cover);
  assert.ok(linkChecks(values).every(row => row.status !== 'fail'));
});

test('uses exact chord clearance and reports invalid detailing without masking strength checks', () => {
  const values = newDefaults();
  values.layers[0].count = 60;
  values.layers[0].link = 7;
  values.layers[0].spacing = 425;
  validateInputs(values);
  const checks = linkChecks(values);
  assert.deepEqual(checks.filter(row => row.status === 'fail').map(row => row.label),
    ['L1 bar clearance', 'L1 link diameter', 'L1 link spacing']);
  values.layers[0].count = 300;
  assert.throws(() => validateInputs(values), /overlap/);
});

test('legacy restoration preserves the original spiral model and unknown inputs', () => {
  const legacy = restoreInputs({ ...defaults, cages: 2, pitch2: 135, custom: 42 });
  assert.equal(legacy.transverse, 'spirals');
  assert.equal(legacy.pitch2, 135);
  assert.equal(legacy.custom, 42);
  validateInputs(legacy);
});
