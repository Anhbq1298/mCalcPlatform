import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLinkLayout, resolveShearLinks, restoreShearSettings } from '../src/link-layout.mjs';
import { checkColumnShear, shearDefaults } from '../src/shear.mjs';

function perimeter(x, y, horizontal, vertical) {
  const bars = [];
  for (const sign of [-1, 1]) {
    for (const offset of [-x, ...horizontal, x]) bars.push({ x: offset, y: sign * y, radius: 10 });
    for (const offset of vertical) bars.push({ x: sign * x, y: offset, radius: 10 });
  }
  return { b: 2 * x + 120, h: 2 * y + 120, cover: 40, link: 10, bars };
}

test('generate links from the actual perimeter and limit restraint distance to 150 mm', () => {
  const small = generateLinkLayout(perimeter(150, 150, [0], [0]));
  assert.deepEqual(small.shapes.map(shape => shape.type), ['outer']);

  const mixed = generateLinkLayout(perimeter(151, 300, [0], [-100, 100]));
  assert.deepEqual(mixed.shapes.map(shape => shape.type), ['outer', 'cross', 'inner']);
  assert.deepEqual(mixed.shapes[1].start, [0, 300]);
  assert.deepEqual([mixed.legsX, mixed.legsY], [4, 3]);
});

test('use the same leg counts in shear and preserve older manual designs', () => {
  const section = perimeter(220, 300, [0], [-100, 100]);
  const layout = generateLinkLayout(section);
  const settings = resolveShearLinks({ ...shearDefaults, enabled: true }, layout);
  assert.deepEqual([settings.legsX, settings.legsY], [4, 3]);
  const shear = checkColumnShear({
    ...section, fc: 30, fy: 500, es: 200000,
    bars: section.bars.map(bar => ({ ...bar, area: Math.PI * bar.radius ** 2 })),
  }, settings, [{ name: 'ULS', p: 200, vx: 100, vy: 100 }]);
  assert.deepEqual(shear.map(row => row.asw), [4 * Math.PI * 25, 3 * Math.PI * 25]);
  const legacy = restoreShearSettings(shearDefaults, { enabled: true, legsX: 7 });
  assert.equal(legacy.mode, 'manual');
  assert.equal(restoreShearSettings(shearDefaults).enabled, false);
  assert.equal(restoreShearSettings(shearDefaults, { enabled: false, mode: 'auto' }).enabled, false);
  assert.equal(resolveShearLinks(legacy, layout).legsX, 7);
});

test('unable to align both anchorage bars returns an error instead of default legs', () => {
  const section = perimeter(220, 150, [0], []);
  section.bars.find(bar => bar.x === 0).x = -20;
  const layout = generateLinkLayout(section);
  assert.match(layout.error, /150 mm/);
  assert.throws(() => checkColumnShear(section,
    resolveShearLinks({ ...shearDefaults, enabled: true }, layout), []), /150 mm/);
});

test('wrap each uniform bundle envelope and count a leg once per restrained bundle', () => {
  for (const radius of [20, 10 + 20 / Math.sqrt(3), 10 + 10 * Math.SQRT2]) {
    const section = perimeter(151, 300, [0], [-100, 100]);
    section.b += 2 * (radius - 10);
    section.h += 2 * (radius - 10);
    for (const bar of section.bars) Object.assign(bar, { radius, bundle: true });

    const layout = generateLinkLayout(section);
    assert.equal(layout.bundles, true);
    assert.equal(layout.bendRadius, radius + section.link / 2);
    assert.deepEqual(layout.shapes.map(shape => shape.type), ['outer', 'cross', 'inner']);
    assert.deepEqual([layout.legsX, layout.legsY], [4, 3]);

    section.bars[0].radius = 10;
    assert.match(generateLinkLayout(section).error, /manual legs for mixed sizes/);
  }
});
