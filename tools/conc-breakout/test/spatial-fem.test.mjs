import test from 'node:test';
import assert from 'node:assert/strict';
import { newConnectionDefaults } from '../src/inputs.mjs';
import { solveSpatial } from '../src/fem/spatial.mjs';
import { membraneStiffness, membraneStress, solveMembrane } from '../src/fem/membrane.mjs';
import { createMesh } from '../src/fem/plate-system.mjs';
import { shankArea } from '../src/anchors.mjs';
import { resolveLayout } from '../src/layout.mjs';
import { transformLoads } from '../src/loads.mjs';

const zero = { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 };
const origin = { x: 0, y: 0, z: 0 };
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `Expected ${expected} ± ${tolerance}, got ${actual}`);

test('Q4 membrane patch: exact constant plane stress and rigid rotation', () => {
  const E = 210000;
  const nu = 0.3;
  const t = 20;
  const coords = [[-10, -20], [10, -20], [10, 20], [-10, 20]];
  const affine = coords.flatMap(([x, y]) => [0.001 * x - 0.004 * y, -0.0003 * y + 0.008 * x]);
  for (const p of [-0.8, 0, 0.8]) {
    const [sx, sy, tau] = membraneStress(10, 20, affine, E, nu, p, -p);
    near(sx, 210, 1e-10);
    near(sy, 0, 1e-10);
    near(tau, E / 2.6 * 0.004, 1e-10);
  }
  const K = membraneStiffness(10, 20, t, E, nu);
  const rigid = coords.flatMap(([x, y]) => [-y, x]);
  for (let i = 0; i < 8; i++) near(rigid.reduce((sum, u, j) => sum + u * K[8 * i + j], 0), 0, 1e-7);
});

test('rigid footprint with unequal shear springs matches shear and torsion by statics', () => {
  const mesh = createMesh([-100, 100], [-100, 100]);
  const slaves = new Set(mesh.nodes.map(node => node.id));
  const supports = mesh.nodes.map(({ id, x, y }) => ({ id, node: id, x, y, k: x < 0 ? 10000 : 20000 }));
  const totalK = 60000;
  const centroid = 100 / 3;
  const polar = supports.reduce((sum, s) => sum + s.k * ((s.x - centroid) ** 2 + s.y ** 2), 0);
  for (const [Fx, Fy, Mz] of [[40000, 0, 0], [0, 30000, 0], [0, 0, 5e6], [40000, -30000, 5e6]]) {
    const eq = solveMembrane({ mesh, slaves, supports, t: 25, load: [Fx, Fy, Mz] });
    const rotation = (Mz - centroid * Fy) / polar;
    for (const anchor of eq.anchors) {
      near(anchor.Vx, anchor.k * (Fx / totalK - anchor.y * rotation), 1e-8);
      near(anchor.Vy, anchor.k * (Fy / totalK + (anchor.x - centroid) * rotation), 1e-8);
    }
  }
  assert.throws(() => solveMembrane({ mesh, slaves, supports: supports.slice(0, 1), t: 25, load: [0, 0, 1] }), /restraint/);
});

function connection(actions, size = 22) {
  const input = newConnectionDefaults();
  const elements = resolveLayout(input).studs.map(stud => ({
    ...stud, kind: 'stud', area: shankArea(input.studs.d), shearK: 45000,
  }));
  return solveSpatial(input, elements, input.concrete, { ...zero, ...actions }, size);
}

test('connection equilibrates axial tension/compression and signed bending', () => {
  for (const actions of [{ N: 100e3 }, { N: -100e3 }, { Mx: -15e6 }, { My: 20e6 }, { Mx: 15e6, My: -20e6 }]) {
    const eq = connection(actions);
    assert.ok(eq.analysisValid, JSON.stringify(eq.residual));
    assert.ok(eq.fem.contact.every(node => node.pressure >= 0));
    assert.ok(eq.tensions.every(anchor => anchor.F >= 0));
    if (actions.N > 0) {
      near(eq.C, 0, 0.05);
      for (const anchor of eq.tensions) near(anchor.F, 25000, 0.05);
    }
    if (actions.N < 0) near(eq.T, 0, 0.05);
  }
});

test('combined spatial equilibrium and identical-origin invariance', () => {
  const applied = { N: 15, Vx: 21, Vy: -31, Mx: 13, My: -9, Mz: 10 };
  const loads = transformLoads({ x: 130, y: -150, z: 120 }, applied);
  const relocated = transformLoads(origin, loads.atOrigin);
  const result = connection(loads.internal);
  assert.ok(result.analysisValid, JSON.stringify(result.residual));
  assert.deepEqual(connection(relocated.internal).membrane.anchors, result.membrane.anchors);
  assert.deepEqual(connection(relocated.internal).tensions, result.tensions);
});

test('force distribution mesh sensitivity for a symmetric combined fixture', () => {
  const loads = { N: 15e3, Vx: 20e3, Vy: -30e3, Mx: 12e6, My: -5e6, Mz: 6e6 };
  const coarse = connection(loads, 22);
  const fine = connection(loads, 15);
  assert.ok(coarse.analysisValid && fine.analysisValid);
  near(coarse.C, fine.C, 0.08 * fine.C);
  const peak = Math.max(...fine.tensions.map(anchor => anchor.F));
  for (const [i, a] of coarse.tensions.entries()) near(a.F, fine.tensions[i].F, 0.08 * peak);
  for (const [i, a] of coarse.membrane.anchors.entries()) {
    const b = fine.membrane.anchors[i];
    near(Math.hypot(a.Vx - b.Vx, a.Vy - b.Vy), 0, 800);
  }
});
