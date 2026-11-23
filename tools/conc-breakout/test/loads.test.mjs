import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyLoading, transformLoads } from '../src/loads.mjs';
import { migrateInputs, newDefaults, restoreInputs, SCHEMA } from '../src/inputs.mjs';

const origin = { x: 0, y: 0, z: 0 };
const zero = { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 };

test('signed six-component loading and consistent engineering units', () => {
  const applied = { N: -40, Vx: 30, Vy: -20, Mx: -3, My: 4, Mz: -5 };
  assert.deepEqual(transformLoads(origin, applied).atOrigin, applied);
  const a = transformLoads({ x: 100, y: -200, z: 300 }, applied);
  assert.deepEqual(a.atOrigin, { N: -40, Vx: 30, Vy: -20, Mx: 11, My: 17, Mz: -1 });
  assert.deepEqual(transformLoads(origin, a.atOrigin).internal, a.internal);
  assert.equal(a.internal.My, 17e6);
});

test('eccentric axial force, elevated shear and free torsional couple', () => {
  const point = { x: -100, y: 200, z: 300 };
  assert.deepEqual(transformLoads(point, { ...zero, N: 50 }).atOrigin, { ...zero, N: 50, Mx: 10, My: 5 });
  assert.deepEqual(transformLoads(point, { ...zero, Vy: 100 }).atOrigin, { ...zero, Vy: 100, Mx: -30, Mz: -10 });
  assert.deepEqual(transformLoads(point, { ...zero, Mz: -8 }).atOrigin, { ...zero, Mz: -8 });
  assert.throws(() => transformLoads({ ...point, z: Infinity }, zero), /finite/);
});

test('schema migration keeps legacy solver selection, load effects and unknown fields', () => {
  const actions = { N: -10, V: 30, e: 250, M: -2, futureAction: 'keep' };
  for (const version of [1, 2, 3]) {
    const saved = { ...newDefaults(), actions, options: {}, unknown: 'keep' };
    const input = restoreInputs(migrateInputs(saved, version));
    assert.equal(input.options.analysis, version === 1 ? 'rigid' : 'fem');
    assert.equal(input.unknown, 'keep');
    assert.deepEqual(input.actions, actions);
    assert.deepEqual(input.loading, { ...legacyLoading(actions), model: 'legacy' });
    assert.equal(transformLoads(input.loading.point, input.loading.applied).atOrigin.Mx, 5.5);
  }
  assert.throws(() => migrateInputs({}, SCHEMA + 1), /newer/);
});
