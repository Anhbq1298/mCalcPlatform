import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { boltProperties, grid, solveGroup } from '../src/bolt-group.mjs';
import { calculate } from '../src/connection.mjs';
import { defaults, highSkew } from '../src/inputs.mjs';
import { sciBoltChecks, sciPlateChecks, sciPlateStability, sciWeldThickness } from '../src/sci-p358.mjs';
import { report } from '../src/report.mjs';
import { compareColumns } from '../src/layout-study.mjs';
import { createDesign, createProject, exportDesignFile, exportPackage, importDesignFile, importPackage } from '../../../packages/design-sdk/src/index.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, 'Expected ' + expected + ' ± ' + tolerance + ', received ' + actual);

test('M24 8.8 normal-hole single shear matches the project reference', () => {
  const bolt = boltProperties(24, '8.8', true);
  assert.equal(bolt.hole, 26);
  close(bolt.shear, 135.552);
  assert.equal(boltProperties(27, '8.8', true).hole, 30);
  assert.ok(boltProperties(24, '8.8', false).shear > bolt.shear);
});

test('elastic bolt forces equilibrate independently of bolt group origin and loading signs', () => {
  const points = [{ x: 20, y: 10 }, { x: 50, y: 20 }, { x: 50, y: 80 }, { x: 24, y: 55 }];
  const applied = [24, -300, 70000];
  const result = solveGroup(points, ...applied);
  const shifted = solveGroup(points.map(p => ({ x: p.x + 140, y: p.y - 82 })), ...applied);
  for (const [index, key] of ['x', 'y', 'm'].entries()) close(result.equilibrium[key], applied[index]);
  for (const [index, bolt] of result.bolts.entries()) close(bolt.force, shifted.bolts[index].force);
  assert.throws(() => solveGroup([{ x: 0, y: 0 }], 0, 0, 1), /coincident/);
});

test('the 50° normal-eccentricity M24 examples match the independent polar properties and bolt forces', () => {
  for (const [columns, polar, force, ratio] of [
    [1, 72250, 175.31, 1.29331], [2, 160500, 88.03, 0.64944], [3, 280750, 58.25, 0.42971],
  ]) {
    const result = calculate({ ...highSkew, columns }, defaults);
    close(result.z, 233.358574, 1e-6);
    close(result.moment / 1000, 70.01, 0.005);
    close(result.group.polar, polar);
    close(Math.max(...result.group.bolts.map(b => b.force)), force, 0.005);
    close(result.checks[0].ratio, ratio, 0.00001);
    close(result.group.equilibrium.y, 300);
    assert.match(result.details.join(' '), /square beam end crosses/);
    assert.equal(result.complete, false);
    assert.equal(result.sci, undefined);
  }
});

test('adding columns moves only the geometry-derived eccentricity', () => {
  for (const eccentricityMode of ['geometry', 'normal', 'axis']) {
    const values = [1, 2, 3].map(columns => calculate({ ...highSkew, eccentricityMode, columns }, defaults));
    const expected = eccentricityMode === 'geometry' ? [70, 110, 150] : Array(3).fill(
      eccentricityMode === 'normal' ? 150 / Math.cos(50 * Math.PI / 180) : 150);
    values.forEach((result, i) => {
      close(result.z, expected[i]);
      close(result.group.bolts[0].x, 70);
    });
  }
});

test('the column comparison keeps the original inputs and reports the plate-width trade-off', () => {
  const input = { ...highSkew };
  const values = compareColumns(input, defaults);
  assert.deepEqual(values.map(option => option.width), [120, 200, 280]);
  assert.equal(new Set(values.map(option => option.eccentricity)).size, 1);
  assert.ok(values[0].shear > values[1].shear && values[1].shear > values[2].shear);
  assert.deepEqual(input, highSkew);
});

test('web and plate thickness affect their own bearing checks independently', () => {
  const base = calculate(defaults, defaults);
  const thinWeb = calculate(defaults, { ...defaults, tw: 8 });
  const thickPlate = calculate({ ...defaults, thickness: 12 }, defaults);
  assert.equal(base.checks[0].ratio, thinWeb.checks[0].ratio);
  assert.equal(base.checks[2].ratio, thinWeb.checks[2].ratio);
  assert.equal(base.checks[1].ratio, thickPlate.checks[1].ratio);
  assert.ok(thinWeb.checks[1].ratio > base.checks[1].ratio);
  assert.ok(thickPlate.checks[2].ratio < base.checks[2].ratio);
});

test('detailing flags short pitches and a hole entering the beam root fillet', () => {
  const result = calculate({ ...defaults, columns: 3, secondGauge: 35, rows: 7 }, defaults);
  assert.match(result.details.join(' '), /Horizontal pitch/);
  assert.match(result.details.join(' '), /root fillet/);
  assert.throws(() => calculate({ ...defaults, rows: 200 }, defaults), /two to thirty/);
});

test('custom coordinates affect eccentricity and preserve the mechanics-only result scope', () => {
  const coordinates = grid(defaults);
  coordinates[0].x += 5;
  const result = calculate({ ...defaults, coordinates }, defaults);
  close(result.z, 110.5);
  close(result.group.equilibrium.y, 300);
  close(result.group.equilibrium.m, 33150);
  assert.equal(result.checks.length, 1);
  assert.equal(result.group.bolts[0].web, null);
  coordinates[1].x = coordinates[0].x;
  assert.match(calculate({ ...defaults, coordinates }, defaults).details.join(' '), /overlap/);
});

test('SCI P358 example double fillet has the published throat and minimum size', () => {
  const weld = sciWeldThickness(275, 10, 8);
  close(weld.throat, 5.7, 0.05);
  close(weld.minimum, 5);
  assert.equal(sciWeldThickness(460, 10, 8), null);
  const result = calculate({ ...defaults, supportThickness: 12 }, defaults);
  assert.ok(result.support.localShear > 300);
  assert.ok(result.support.punching < 1);
  assert.equal(calculate({ ...highSkew, supportThickness: 12 }, defaults).support, undefined);
});

test('SCI P358 worked example 1 Check 2 and plate shear components agree within published rounding', () => {
  // P358 pp. 140–145. The worked example rounds intermediate force coefficients and strengths.
  const bolt = boltProperties(20, '8.8', true);
  for (const data of [
    { columns: 1, rows: 4, z: 50, beamThickness: 9.5, height: 290, published: [288, 332, 291, 363, 435, 347] },
    { columns: 2, rows: 5, z: 80, beamThickness: 10.1, height: 360, published: [577, 574, 565, 450, 538, 494] },
  ]) {
    const points = grid({ ...data, pitch: 70, gauge: 60, gap: 10, beamEnd: 40, bottom: 40 });
    const group = solveGroup(points, 0, 1, data.z);
    const result = sciBoltChecks({ ...data, group, bolt, shearResistance: bolt.shear, pitch: 70,
      gauge: data.columns === 1 ? Infinity : 60, plateEnd: 40, plateEdge: 50, beamVerticalEnd: 40, beamEnd: 40,
      plateThickness: 10, plateFu: 410, beamFu: 410 });
    const plate = sciPlateChecks({ ...data, thickness: 10, gauge: 60, edge: 50, end: 40, d0: 22, fy: 275, fu: 410 });
    [result.bolt, result.plate.resistance, result.web.resistance, plate.gross, plate.net, plate.block]
      .forEach((actual, index) => close(actual, data.published[index], data.published[index] * (index < 3 ? 0.015 : 0.002)));
    const stability = sciPlateStability({ ...data, thickness: 10, fy: 275, firstBolt: 50 });
    close(stability.resistance, data.columns === 1 ? 771 : 742.5, 0.1);
  }
});

test('long fin plate stability uses the first bolt line and requires restraint and S275', () => {
  const input = { height: 600, thickness: 8, fy: 275, z: 210, firstBolt: 170, restrained: true };
  const result = sciPlateStability(input);
  assert.equal(result.type, 'long');
  assert.ok(result.reduction < 0.6);
  // P358 Table 5.2 gives 0.44 at slenderness 1.05, or 462 kN using its rounded factor.
  close(result.slenderness, 1.05, 0.005);
  close(result.resistance, 462, 2);
  assert.equal(sciPlateStability({ ...input, restrained: false }).resistance, null);
  assert.equal(sciPlateStability({ ...input, fy: 355 }).resistance, null);
});

test('native and project files preserve inputs, unknown fields and the editable worksheet', async () => {
  const manifest = JSON.parse(await readFile(new URL('../tool.json', import.meta.url)));
  const input = { ...defaults, futureField: { coordinates: [8, 3] } };
  const doc = createDesign(manifest, 'Sample mFinPlate', input);
  doc.report = report(input, { ...defaults, name: 'UB 533x210x92' }, calculate(input, defaults));
  const exported = await exportDesignFile(doc, manifest);
  const file = await importDesignFile(new File([exported], 'fin-plate.mfp'), [manifest]);
  const reopenedDesign = file;
  const preview = new File([JSON.stringify({ format: 'mcalc-design', version: 1, design: doc })], 'preview.mfp');
  assert.deepEqual((await importDesignFile(preview, [manifest])).inputs, input);
  assert.deepEqual(reopenedDesign.inputs, input);
  assert.equal(reopenedDesign.report.format, 'calccanvas');
  const project = createProject('Fin plate connections');
  project.folders.find(folder => folder.id === 'connections').designs.push(doc.id);
  const reopened = await importPackage(await exportPackage({ project, designs: [doc] }));
  assert.deepEqual(reopened.project, project);
  assert.deepEqual(reopened.designs[0].inputs, input);
  assert.deepEqual(reopened.designs[0].report, doc.report);
});
