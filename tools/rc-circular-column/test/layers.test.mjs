import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, restoreInputs, migrateSavedInputs } from '../src/inputs.mjs';
import { cageGeometry } from '../src/reinforcement.mjs';
import { solveColumn } from '../src/solver.mjs';
import { pmRanges, chartTicks } from '../src/pm-chart.mjs';

test('schema 2 combined closed-link layers retain original radii and unknown layer fields', () => {
  const old = { ...defaults, inputVersion: undefined, transverse: 'links', diameter: 1000, cover: 75,
    layers: [{ count: 22, bar: 32, link: 20, spacing: 85, extension: 42 },
      { count: 16, bar: 25, link: 16, spacing: 150 }, { count: 12, bar: 25, link: 16, spacing: 150 }] };
  delete old.longitudinal;
  const migrated = migrateSavedInputs(old, 2);
  assert.deepEqual(cageGeometry(migrated).map(c => c.barRadius), [389, 328.5, 278.5]);
  assert.equal(migrated.longitudinal[0].extension, 42);
  assert.equal(migrated.legacyReinforcement.layers[0].extension, 42);
  assert.deepEqual(migrated.transverse.map(link => link.effectiveLegs), [2, 0, 0]);
  assert.equal(migrated.inputVersion, 3);
  assert.equal(migrateSavedInputs({ count1: 22 }, 1).transverse, 'spirals');
});

test('nested links receive no automatic shear credit', () => {
  const input = structuredClone(defaults), first = solveColumn(input);
  input.transverse[1].spacing = 50;
  assert.equal(solveColumn(input).linkStress, first.linkStress);
  input.transverse[1].effectiveLegs = 2;
  assert.ok(solveColumn(input).linkStress > first.linkStress);
});

test('P–M chart follows rectangular format with positive resultant M and readable grid ticks', () => {
  const result = solveColumn(defaults), ranges = pmRanges(result);
  assert.equal(ranges.x[0], 0);
  assert.ok(ranges.x[1] > result.demand[0]);
  assert.ok(ranges.y[0] < 0 && ranges.y[1] > result.demand[1]);
  assert.deepEqual(chartTicks(0, 6000, 1000).values, [0, 1000, 2000, 3000, 4000, 5000, 6000]);
  assert.ok(chartTicks(0, 6000, 1).values.length <= 7);
  assert.equal(restoreInputs(defaults).inputVersion, 3);
});
