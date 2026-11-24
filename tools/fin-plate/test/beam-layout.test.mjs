import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/connection.mjs';
import { defaults } from '../src/inputs.mjs';

const beam = { h: 533.1, b: 209.3, tw: 10.1, tf: 15.6, r: 13 };
const supportingProfile = { h: 610, b: 229, tw: 13, tf: 20, r: 13 };
const input = { ...defaults, supportSection: 0, supportingProfile, supportLevel: 0, rows: 4, restrained: true };

test('an aligned top flange clashes in the fit layout until the supported beam is adequately notched', () => {
  const clashes = result => result.details.some(detail => detail.includes('supporting top flange'));
  assert.ok(clashes(calculate(input, beam)));
  assert.ok(clashes(calculate({ ...input, notchTop: 45, notchLength: 90 }, beam)));
  const fit = calculate({ ...input, notchTop: 45, notchLength: 180 }, beam);
  assert.equal(clashes(fit), false);
  assert.ok(fit.notchedBeam);
  assert.equal(fit.support.thickness, supportingProfile.tw);
});

test('outside layout moves the bolt group, extends the fin plate, and retains supported beam coping', () => {
  const common = { ...input, supportLevel: 40, notchTop: 45, notchBottom: 45, notchLength: 180 };
  const fit = calculate(common, beam);
  const outside = calculate({ ...common, beamLayout: 'outside' }, beam);
  const projection = (supportingProfile.b - supportingProfile.tw) / 2;
  assert.equal(outside.beamGap, common.gap + projection);
  assert.equal(outside.width - fit.width, projection);
  assert.ok(Math.abs(outside.z - fit.z - projection) < 1e-9);
  assert.ok(Math.abs(outside.moment - fit.moment - common.vertical * projection) < 1e-7);
  assert.deepEqual(outside.details, []);
  assert.ok(outside.notchedBeam);
  assert.ok(!outside.sci && !outside.weld);
  assert.match(outside.openChecks.join(' '), /Extended fin plate/);
});

test('skew outside preserves clearance at the closest supported flange corner', () => {
  const result = calculate({ ...input, beamLayout: 'outside', skew: -35 }, beam);
  const { c, s, projection } = result.beamLayout;
  assert.ok(Math.abs(result.beamGap * c - beam.b * s / 2 - projection - input.gap * c) < 1e-9);
  assert.ok(!result.details.some(detail => detail.includes('intersects the supporting')));
});

test('new beam joints require a section while older inputs still run with the reference plane', () => {
  assert.throws(() => calculate({ ...defaults, supportSection: -1 }, beam), /Choose a supporting beam/);
  assert.equal(calculate(defaults, beam).beamLayout, null);
});

test('top, mid-depth and bottom alignment use the two beam depths', () => {
  const inputWithOffset = { ...input, supportLevel: 23 };
  for (const [alignment, fraction] of [['top', 0], ['mid', 0.5], ['bottom', 1]]) {
    const result = calculate({ ...inputWithOffset, supportAlignment: alignment }, beam);
    assert.equal(result.beamLayout.offset, (supportingProfile.h - beam.h) * fraction);
    assert.equal(result.beamLayout.referenceFraction, fraction);
  }
  const legacy = { ...inputWithOffset };
  delete legacy.supportAlignment;
  assert.equal(calculate(legacy, beam).beamLayout.offset, 23);
});
