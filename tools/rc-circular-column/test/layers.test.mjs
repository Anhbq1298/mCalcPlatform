import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, exportDesignFile, importDesignFile } from '../../../packages/design-sdk/src/index.mjs';
import { detailing } from '../src/detailing.mjs';
import { elevationGeometry } from '../src/elevation.mjs';
import { minimumClearance } from '../src/geometry.mjs';
import { defaults, migrateInputs, newDefaults, validateInputs } from '../src/inputs.mjs';
import { shearCheck } from '../src/shear.mjs';
import { sectionResistance, slendernessCheck } from '../src/section.mjs';
import { readFileSync } from 'node:fs';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, actual + ' differs from ' + expected);
const tool = JSON.parse(readFileSync(new URL('../tool.json', import.meta.url)));

function reference(manual = true) {
  const transverse = [{ diameter: 12, spacing: 150 }, { diameter: 12, spacing: 125 }];
  return { ...newDefaults(), diameter: 1000, concrete: 32, cover: 40,
    layers: [{ count: 20, bar: 32, offset: 0, radius: null },
      { count: 12, bar: 25, offset: 0, radius: manual ? 371.5 : null }],
    reinforcement: { links: transverse, spirals: structuredClone(transverse) } };
}

test('D1000 reference, tangency, corrected automatic placement and congestion warning', () => {
  const input = reference();
  const section = validateInputs(input);
  assert.equal(minimumClearance(32, 25, 20), 32);
  const [outer, inner] = section.rings;
  assert.deepEqual([outer.barRadius, inner.barRadius, outer.linkRadius, inner.linkRadius], [432, 371.5, 454, 390]);
  assert.equal(outer.cover, 40);
  assert.equal(inner.radialClear, 32);
  assert.equal(inner.placementGap, 20);
  assert.equal(section.collision, false);
  for (const ring of section.rings) {
    assert.equal(ring.linkRadius - ring.link / 2, ring.barRadius + ring.bar / 2);
    for (const bar of ring.bars) near(Math.hypot(bar.x, bar.y), ring.barRadius);
  }
  assert.equal(detailing(input, section).find(row => row.label === 'L2 concrete placement').status, 'warning');
  const automatic = validateInputs(reference(false)).rings[1];
  assert.deepEqual([automatic.barRadius, automatic.linkRadius, automatic.radialClear, automatic.placementGap],
    [359.5, 378, 44, 32]);
});

test('flags collisions, short cages, impractical pitch and manual cover violations', () => {
  const input = reference();
  input.layers[1].radius = 403;
  assert.equal(validateInputs(input).collision, true);
  input.layers[1].radius = 371.5;
  input.layers[0].radius = 442;
  input.layers[0].count = 160;
  input.height = 100;
  input.transverse = 'spirals';
  input.reinforcement.spirals[0].spacing = 8;
  const section = validateInputs(input);
  assert.equal(section.collision, true);
  assert.ok(section.rings[0].turnClear < 0);
  const failed = detailing(input, section).filter(row => row.status === 'fail').map(row => row.label);
  for (const label of ['Nominal cover', 'L1 bar clearance', 'L1 helix pitch', 'L2 cage height']) assert.ok(failed.includes(label));
  input.layers[0].count = 301;
  assert.throws(() => validateInputs(input), /reinforcement inputs/);
});

test('mode settings persist independently and only the cage and shear status change on switch', () => {
  const input = reference(false);
  input.layers[1].offset = 19;
  input.reinforcement.spirals[0] = { diameter: 16, spacing: 120 };
  input.effectiveLengthX = 4000;
  input.effectiveLengthY = 3500;
  const closed = validateInputs(input);
  const linksResult = sectionResistance(input, closed);
  const linksSlenderness = slendernessCheck(input, closed);
  const linksShear = shearCheck(input, closed);
  const linksElevation = elevationGeometry(input, closed.rings);
  input.transverse = 'spirals';
  const spiral = validateInputs(input);
  assert.deepEqual(spiral.bars, closed.bars);
  assert.deepEqual(sectionResistance(input, spiral), linksResult);
  assert.deepEqual(slendernessCheck(input, spiral), linksSlenderness);
  assert.equal(linksShear.statusLabel, 'Not Verified');
  for (const row of [linksShear, shearCheck(input, spiral)]) assert.equal(row.ratio, undefined);
  assert.equal(linksElevation.layers[0].links[1] - linksElevation.layers[0].links[0], 150);
  const [{ turns }] = elevationGeometry(input, spiral.rings).layers;
  assert.equal(turns[0].rear, false);
  assert.equal(turns[1].rear, true);
  near(turns[0].points[0][1] + 120, turns[1].points.at(-1)[1]);
  near(turns[0].points[0][0], turns[1].points.at(-1)[0]);
});

test('migrates v1 spiral and v2 closed-link designs with their saved bar centres and unknown fields', () => {
  const oldSpiral = migrateInputs({ ...defaults, cages: 2, pitch2: 135, custom: 42 }, 1);
  assert.equal(oldSpiral.transverse, 'spirals');
  assert.equal(oldSpiral.custom, 42);
  assert.equal(oldSpiral.reinforcement.spirals[1].spacing, 135);
  assert.deepEqual(validateInputs(oldSpiral).rings.map(ring => ring.barRadius), [489, 444.5]);
  const oldLinks = migrateInputs({ transverse: 'links', diameter: 1000, cover: 40, layers: [
    { count: 20, bar: 32, link: 12, spacing: 150, custom: { mark: 'X' } },
    { count: 12, bar: 25, link: 12, spacing: 125 },
  ] }, 2);
  assert.deepEqual(validateInputs(oldLinks).rings.map(ring => ring.barRadius), [432, 371.5]);
  assert.deepEqual(oldLinks.layers[0].custom, { mark: 'X' });
  assert.throws(() => migrateInputs({}, 4), /Unsupported/);
});

test('round-trips mode settings, offset, and radius through the native .mccol file', async () => {
  const input = reference();
  input.transverse = 'spirals';
  input.layers[1].offset = 21;
  input.reinforcement.spirals[0] = { diameter: 16, spacing: 120, custom: 'retain' };
  const design = createDesign(tool, 'D1000 round trip', input);
  const exported = await exportDesignFile(design, tool);
  const imported = await importDesignFile(new File([exported], 'D1000.mccol'), [tool]);
  assert.equal(imported.schema, tool.schema);
  assert.deepEqual(imported.inputs, input);
});

test('new designs use closed links; missing lengths and externally assessed actions are explicit', () => {
  const input = newDefaults();
  assert.equal(input.transverse, 'links');
  assert.equal(slendernessCheck(input, validateInputs(input)).statusLabel, 'Not Verified');
  input.effectiveLengthX = 1000;
  input.effectiveLengthY = 1000;
  assert.equal(slendernessCheck(input, validateInputs(input)).status, 'pass');
  input.effectiveLengthX = 8000;
  assert.equal(slendernessCheck(input, validateInputs(input)).statusLabel, 'Not Verified');
  input.secondOrderIncluded = 1;
  assert.match(slendernessCheck(input, validateInputs(input)).detail, /externally/);
});
