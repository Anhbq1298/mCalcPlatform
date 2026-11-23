import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/calculate.mjs';
import { migrateInputs, newConnectionDefaults, newDefaults } from '../src/inputs.mjs';

test('assumptions, unchecked welded details and missing shear inputs remain incomplete', () => {
  const input = newConnectionDefaults();
  input.options.loadPathConfirmed = true;
  input.concrete.splittingReinforcement = true;
  const result = calculate(input);
  assert.equal(result.status, 'Incomplete');
  assert.equal(result.eq.analysisValid, false);
  assert.match(result.eq.shearIssue, /shear stiffness/);
  assert.ok(result.rows.some(row => row.label === 'Transfer into the receiving member' && row.status === 'incomplete'));
});

test('stud-only axial design reports the solved tension, steel, cone and pull-out', () => {
  const input = newConnectionDefaults();
  input.rebars.rows = [];
  input.loading.point.z = 0;
  input.loading.applied.Vy = 0;
  input.loading.applied.N = 100;
  const result = calculate(input);
  assert.ok(result.eq.analysisValid);
  assert.equal(result.status, 'Incomplete');
  const stud = result.studs[0];
  assert.ok(Math.abs(stud.F - 25000) < 0.05);
  assert.ok(Math.abs(stud.pulloutRd - Math.PI / 4 * (35 ** 2 - 22 ** 2) * 7.5 * 30 / result.gammas.Mp) < 1e-8);
  assert.ok(result.rows.some(row => row.label === 'Stud group cone' && row.status === 'pass'));
  assert.ok(result.rows.some(row => row.label === 'Splitting and product limits' && row.status === 'incomplete'));
});

test('finite-edge torsion uses signed per-stud forces and identifies open concrete checks', () => {
  const input = newConnectionDefaults();
  input.studs.shearStiffness = 45000;
  input.studs.productReference = 'Numerical fixture';
  input.concrete.edges.bottom = 250;
  input.loading.applied.Mz = 5;
  const result = calculate(input);
  assert.ok(result.eq.analysisValid);
  assert.ok(new Set(result.studs.map(stud => stud.Vx.toFixed(1))).size > 1);
  assert.ok(result.rows.some(row => row.label === 'Directional edge breakout' && row.status === 'incomplete'));
  assert.ok(result.rows.some(row => row.label === 'Stud group pry-out screen'));
});

test('opening a historical file reproduces forces and gates unsupported assumptions', () => {
  const original = newDefaults();
  original.options.loadPathConfirmed = true;
  const before = calculate(original);
  const after = calculate(migrateInputs(structuredClone(original), 3));
  assert.deepEqual(after.eq.tensions, before.eq.tensions);
  assert.notEqual(after.status, 'Pass');
  assert.equal(after.rows.find(row => row.label === 'Transfer into the receiving member (STM, laps)').status, 'incomplete');
});
