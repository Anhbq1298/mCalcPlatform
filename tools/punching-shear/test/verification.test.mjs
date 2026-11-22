import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseTable, handExamples } from '../scripts/verification.mjs';

test('worked examples: tool equals the hand calculation to 1e-6 relative', () => {
  for (const example of handExamples()) {
    for (const row of example.rows) assert.ok(row.diff < 1e-6, `${example.id}: ${row.quantity} hand ${row.hand} tool ${row.tool}`);
  }
});

test('every reference case gives its expected status', () => {
  for (const row of caseTable()) assert.equal(row.status, row.expect, row.id);
});

test('the governing check named in the result carries the governing UR (count checks never govern)', async () => {
  const { CASES } = await import('../src/examples.mjs');
  const { calculateDesign } = await import('../src/head.mjs');
  for (const item of CASES) {
    const result = calculateDesign(item.input);
    const load = result.loads.find(entry => entry.name === result.governing.load);
    const row = load.rows.find(entry => entry.label === result.governing.check);
    assert.ok(row && row.unit !== 'layers', `${item.id}: ${result.governing.check}`);
    assert.ok(Math.abs(row.ur - result.governing.ur) < 1e-9, `${item.id}: ${row.ur} vs ${result.governing.ur}`);
  }
});
