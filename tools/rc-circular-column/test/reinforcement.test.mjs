import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, restoreInputs, validateInputs } from '../src/inputs.mjs';
import { legacyDefaults } from '../src/legacy-inputs.mjs';
import { cageGeometry } from '../src/reinforcement.mjs';
import { detailingChecks } from '../src/detailing.mjs';
import { solveColumn } from '../src/solver.mjs';
import { sectionSvg } from '../src/section-svg.mjs';
import { buildReport } from '../src/report.mjs';

const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('D1000 preserves tangency and flags the 20 mm concrete passage', () => {
  const { cages, checks, nearest, status } = detailingChecks(defaults);
  assert.deepEqual(cages.map(c => [c.barRadius, c.linkRadius]), [[432, 454], [371.5, 390]]);
  close(nearest, 32);
  for (const c of cages) close(c.linkRadius - c.link.diameter / 2, c.barRadius + c.bar / 2);
  const intrusion = checks.find(c => c.id === 'L2-L1-passage');
  assert.equal(intrusion.status, 'fail'); assert.equal(intrusion.value, 20); assert.equal(intrusion.limit, 32);
  assert.equal(status, 'fail');
  assert.ok(checks.filter(c => /cover$|tangency$|circumferential$|radial$/.test(c.id)).every(c => c.status === 'pass'));
});

test('checks actual two-dimensional spacing for rotated unequal layers', () => {
  const input = structuredClone(defaults); input.longitudinal[1].angle = 15;
  const cages = cageGeometry(input);
  let expected = Infinity;
  const bars = cages.flatMap(c => c.bars);
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    expected = Math.min(expected, Math.hypot(bars[i].x - bars[j].x, bars[i].y - bars[j].y) - (bars[i].diameter + bars[j].diameter) / 2);
  }
  close(detailingChecks(input).nearest, expected);
  assert.ok(expected > 32);
  assert.equal(detailingChecks(input).checks.find(c => c.id === 'L2-L1-passage').value, 20);
});

test('uses chord clear spacing and rejects clashes and missing restraint', () => {
  const crowded = structuredClone(defaults); crowded.longitudinal[0].count = 80;
  assert.equal(detailingChecks(crowded).checks.find(c => c.id === 'L1-circumferential').status, 'fail');
  const collision = structuredClone(defaults); collision.longitudinal[1].radialClear = 1;
  assert.throws(() => solveColumn(collision), /overlaps|fit/);
  const missing = structuredClone(defaults); missing.transverse.pop();
  assert.equal(detailingChecks(missing).checks.find(c => c.id === 'L2-restraint').status, 'fail');
  const oversized = structuredClone(defaults); oversized.cover = 500;
  assert.throws(() => solveColumn(oversized), /overlaps|fit/);
});

test('applies aggregate, entered NA parameters, reduced zones and per-layer link spacings', () => {
  const input = structuredClone(defaults); input.aggregate = 40; input.k2 = 10;
  assert.equal(cageGeometry(input)[1].radialClear, 50);
  input.k1 = 2; assert.equal(cageGeometry(input)[1].radialClear, 64);
  input.transverse[1].spacing = 300; input.reducedZone = 1;
  assert.equal(detailingChecks(input).checks.find(c => c.id === 'L2-link-spacing').status, 'fail');
  assert.ok(detailingChecks(input).checks.some(c => c.id === 'applicability' && c.status === 'review'));
});

test('sequential legacy migration retains bar geometry and unknown fields', () => {
  const raw = { ...legacyDefaults, cages: 2, extension: { future: 42 } };
  const input = restoreInputs(raw), cages = cageGeometry(input);
  assert.equal(input.inputVersion, 2); assert.deepEqual(input.extension, raw.extension);
  close(cages[0].barRadius, 489); close(cages[1].barRadius, 444.5);
  assert.equal(input.longitudinal[1].radialClear, 16);
  assert.match(input.migrationReview, /Legacy/);
  input.longitudinal[0].extension = 'retained'; input.transverse[0].extension = 123;
  assert.deepEqual(restoreInputs(JSON.parse(JSON.stringify(input))), input);
  assert.throws(() => restoreInputs({ ...input, inputVersion: 3 }), /read-only/);
  assert.throws(() => restoreInputs({ ...input, inputVersion: 0 }), /Unsupported/);
  assert.throws(() => restoreInputs({ inputVersion: 2 }), /missing/);
  const duplicate = structuredClone(input); duplicate.transverse.push({ ...duplicate.transverse[0] });
  assert.throws(() => validateInputs(duplicate), /unique/);
});

test('retains pinned circular worksheet PMM and shear reference examples', () => {
  // Independent published checks retained in Canvas columnTemplates.test.ts at 161910b4.
  const input = restoreInputs(legacyDefaults), result = solveColumn(input);
  close(result.combined, 0.7688831778, 1e-8);
  close(result.shear, 0.8718420942, 1e-8);
  close(result.width, 1022.414992, 1e-5);
  const classA = solveColumn({ ...input, classA: 1 }); close(classA.cot, 2);
  const zero = solveColumn({ ...input, axial: 0, mx: 0, my: 0, shear: 0 });
  assert.equal(zero.combined, 0); assert.equal(zero.shear, 0);
});

test('all layers feed section resistance and per-layer conditional shear estimates', () => {
  const input = structuredClone(defaults);
  const original = solveColumn(input);
  input.longitudinal.push({ id: 'L3', count: 8, diameter: 20, angle: 10, radialClear: 50 });
  input.transverse.push({ layer: 'L3', diameter: 10, spacing: 100 });
  const added = solveColumn(input);
  assert.equal(added.geometry.length, 3);
  assert.notEqual(added.combined, original.combined);
  const changed = structuredClone(input); changed.transverse[2].spacing = 200;
  assert.ok(solveColumn(changed).linkStress < added.linkStress);
  assert.ok(added.detailing.some(c => c.id === 'shear-model' && c.status === 'review'));
});

test('SVG uses physical millimetre radii/diameters and report carries failures', () => {
  const svg = sectionSvg(defaults);
  assert.match(svg, /data-link="L1" r="454"[^>]*stroke-width="12"/);
  assert.match(svg, /data-link="L2" r="390"/);
  assert.equal((svg.match(/data-layer=/g) ?? []).length, 32);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  const result = solveColumn(defaults), report = buildReport(defaults, result);
  const image = report.shapes.find(s => s.type === 'image');
  assert.ok(image.props.src.startsWith('data:image/svg+xml;base64,'));
  assert.equal(Buffer.from(image.props.src.split(',')[1], 'base64').toString('utf8'), svg);
  const prose = report.shapes.filter(s => s.type === 'text').map(s => s.props.html).join(' ');
  assert.match(prose, /FAIL/); assert.match(prose, /20.000/); assert.match(prose, /National Annex/);
});
