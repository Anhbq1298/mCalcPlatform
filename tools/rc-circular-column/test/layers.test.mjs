import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, exportDesignFile, importDesignFile } from '../../../packages/design-sdk/src/index.mjs';
import { detailing } from '../src/detailing.mjs';
import { minimumClearance } from '../src/geometry.mjs';
import { defaults, migrateInputs, newDefaults, validateInputs } from '../src/inputs.mjs';
import { shearCheck } from '../src/shear.mjs';
import { sectionResistance } from '../src/section.mjs';
import { memberMoments } from '../src/slenderness.mjs';
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
  input.effectiveLengthX = 8000;
  input.effectiveLengthY = 3500;
  const closed = validateInputs(input);
  const linksResult = sectionResistance(input, closed);
  const linksSlenderness = memberMoments(input, closed);
  const linksShear = shearCheck(input, closed);
  input.transverse = 'spirals';
  const spiral = validateInputs(input);
  assert.deepEqual(spiral.bars, closed.bars);
  assert.deepEqual(sectionResistance(input, spiral), linksResult);
  assert.deepEqual(memberMoments(input, spiral), linksSlenderness);
  assert.equal(linksShear.statusLabel, 'Not Verified');
  for (const row of [linksShear, shearCheck(input, spiral)]) assert.equal(row.ratio, undefined);

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
  assert.throws(() => migrateInputs({}, 5), /Unsupported/);
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
  assert.equal(memberMoments(input, validateInputs(input)).row.statusLabel, 'Not Verified');
  input.effectiveLengthX = 1000;
  input.effectiveLengthY = 1000;
  assert.equal(memberMoments(input, validateInputs(input)).row.status, 'pass');
  input.effectiveLengthX = 8000;
  assert.equal(memberMoments(input, validateInputs(input)).row.statusLabel, 'Second order applied');
  input.secondOrderIncluded = 1;
  assert.match(memberMoments(input, validateInputs(input)).row.detail, /externally/);
});

test('D1000 nominal curvature matches hand calculation by axis and feeds PMM', () => {
  const input = reference();
  input.layers.pop();
  input.reinforcement.links.pop();
  input.reinforcement.spirals.pop();
  Object.assign(input, { axial: 8000, mx: -1000, my: 500, effectiveLengthX: 8000, effectiveLengthY: 1000 });
  const section = validateInputs(input);
  const calculated = memberMoments(input, section);
  // With d = 500 + 432/√2, λx = 32, λy = 4, λlim ≈ 15.6,
  // EC2 5.8.8 gives M2x = 565.03 kNm; imperfection moments are 160 and 20 kNm.
  near(calculated.mx, -1725.03, 0.01);
  near(calculated.my, 520);
  assert.ok(sectionResistance({ ...input, ...calculated }, section).combined > sectionResistance(input, section).combined);
  assert.equal(calculated.row.hideRatio, true);
  const old = migrateInputs({ ...input, unknown: 42 }, 3);
  assert.equal(old.unknown, 42);
  assert.equal(old.creepRatio, 2);
  input.layers[0].count = 19;
  assert.equal(memberMoments(input, validateInputs(input)).row.statusLabel, 'Not Verified');
});
