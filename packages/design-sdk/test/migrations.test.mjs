import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateToolInputs } from '../src/migrations.mjs';

test('advances sequentially, preserves unknown fields and never mutates saved inputs', async () => {
  const saved = { schema: 1, inputs: { extra: { keep: true }, count: 3 } };
  const calls = [];
  const result = await migrateToolInputs(saved, { schema: 3 }, {
    migrate: (input, version) => { calls.push(version); input.extra.keep = false; return { count: input.count + 1 }; },
  });
  assert.deepEqual(calls, [1, 2]); assert.equal(result.count, 5);
  assert.deepEqual(result.extra, { keep: true }); assert.equal(saved.inputs.count, 3);
  await assert.rejects(migrateToolInputs({ ...saved, schema: 4 }, { schema: 3 }, {}), /newer version/);
  await assert.rejects(migrateToolInputs(saved, { schema: 3 }, {}), /cannot migrate/);
});
