import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDesign, createProject, duplicateDesign, importDesignFile, exportDesignFile, exportPackage, importPackage,
} from '../../../packages/design-sdk/src/index.mjs';
import { calculate } from '../src/calculate.mjs';
import { buildReport } from '../src/report.mjs';
import { migrateInputs, newConnectionDefaults, newDefaults, restoreInputs, SCHEMA } from '../src/inputs.mjs';
import { examples, evaluateExample } from '../benchmarks/aci-349.mjs';

const tool = JSON.parse(await readFile(new URL('../tool.json', import.meta.url), 'utf8'));

test('spatial report and signed loads round-trip through mcbo and mcalc alongside a legacy design', async () => {
  assert.equal(tool.schema, SCHEMA);
  const inputs = newConnectionDefaults();
  inputs.loading.applied = { N: 25, Vx: -8, Vy: 10, Mx: -2, My: -3, Mz: 3, future: true };
  inputs.loading.point = { x: 320, y: -170, z: -250 };
  inputs.studs.shearStiffness = 42000;
  const result = calculate(inputs);
  assert.ok(result.eq.analysisValid);
  const report = buildReport(result, { pageHeight: 1123, pageGap: 28, designName: 'CB-01' });
  assert.equal(report.format, 'calccanvas');
  const tables = report.shapes.filter(shape => shape.type === 'table');
  assert.ok(tables.some(shape => shape.props.cells.flat().some(cell => cell.value === 'At O')));
  assert.ok(tables.some(shape => shape.props.cells.flat().some(cell => cell.value === 'Vy kN')));
  assert.ok(report.shapes.filter(shape => shape.type === 'image').length >= 4);
  assert.ok(report.shapes.some(shape => shape.props.html?.includes('Status: <b>Incomplete</b>')));
  const doc = { ...createDesign(tool, 'CB-01', inputs), report };
  const blob = await exportDesignFile(doc, tool);
  const reopened = await importDesignFile(new File([blob], 'CB-01.mcbo'), [tool]);
  assert.deepEqual(reopened.inputs, inputs);
  assert.deepEqual(reopened.report, report);
  assert.deepEqual(duplicateDesign(reopened).inputs, inputs);
  const old = { ...createDesign(tool, 'CB-old', { ...newDefaults(), futureTop: true }), schema: 3 };
  const project = createProject('Embedments');
  project.folders[0].designs.push(doc.id, old.id);
  const projectCopy = await importPackage(await exportPackage({ designs: [doc, old], project }));
  assert.deepEqual(projectCopy.project, project);
  assert.deepEqual(projectCopy.designs[0].report, report);
  const migrated = restoreInputs(migrateInputs(projectCopy.designs[1].inputs, old.schema));
  assert.ok(migrated.futureTop);
  assert.equal(migrated.loading.model, 'legacy');
  assert.equal(migrated.loading.applied.Vy, -migrated.actions.V);
});

test('ACI B2(b) and B3(b) reproduce the published statics and record separate shell comparisons', () => {
  for (const item of examples) {
    const record = evaluateExample(item);
    assert.ok(Math.abs(record.independentStaticsKip - record.publishedTopDemandKip) < 0.05);
    assert.ok(record.analyticalConvergence);
    assert.ok(record.meshComparison.ratio < 0.05);
    assert.match(record.verification, /Comparison only/);
  }
});
