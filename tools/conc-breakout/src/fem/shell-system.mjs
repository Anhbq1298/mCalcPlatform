// MITC4 bending plus Q4 membrane for a flat shell. Global master DOFs are
// [u, v, w, rx, ry, rz] at the plate–concrete interface. Nodal translations
// u and v are at mid-thickness. bx = ry and by = -rx for a rigid rotation.
import { bandMatrix, solveBordered } from './banded.mjs';
import { centreMoments, elementStiffness, plateRigidities, surfaceVonMises } from './mitc4.mjs';
import { membraneStiffness, membraneStress } from './membrane.mjs';

const bend = [2, 3, 4];
const membrane = [0, 1];
const displacementTolerance = 1e-11;
const inactiveStiffness = 1e-9;

function shellEquations(mesh, slaves, offset, length) {
  let count = 0;
  const terms = mesh.nodes.map(({ id, x, y }) => {
    if (!slaves.has(id)) return [0, 1, 2, 3, 4].map(() => [[count++, 1, false]]);
    return [
      [[0, 1, true], [4, offset / length, true], [5, -y / length, true]],
      [[1, 1, true], [3, -offset / length, true], [5, x / length, true]],
      [[2, 1, true], [3, y / length, true], [4, -x / length, true]],
      [[4, 1 / length, true]], [[3, -1 / length, true]],
    ];
  });
  return { terms, count };
}

function blocks(count, bandwidth) {
  return {
    A: bandMatrix(count, bandwidth),
    B: Array.from({ length: 6 }, () => new Float64Array(count)),
    C: Array.from({ length: 6 }, () => new Float64Array(6)),
  };
}

function add({ A, B, C }, left, right, stiffness) {
  for (const [i, ci, mi] of left) for (const [j, cj, mj] of right) {
    const value = ci * cj * stiffness;
    if (mi && mj) C[i][j] += value;
    else if (mi) B[i][j] += value;
    else if (!mj && i >= j) A.add(i, j, value);
  }
}

function assembleElement(system, terms, element, rig, t, E, nu) {
  for (const [dofs, stiffness] of [
    [bend, elementStiffness(element.a, element.b, rig)],
    [membrane, membraneStiffness(element.a, element.b, t, E, nu)],
  ]) {
    const local = element.nodes.flatMap(node => dofs.map(dof => terms[node][dof]));
    for (let i = 0; i < local.length; i++) for (let j = 0; j < local.length; j++) {
      add(system, local[i], local[j], stiffness[i * local.length + j]);
    }
  }
}

function interfaceShear(terms, offset, component) {
  return [...terms[component], ...terms[3 + component].map(([index, c, master]) => [index, -offset * c, master])];
}

function value(terms, solution) {
  return terms.reduce((sum, [index, c, master]) => sum + c * (master ? solution.m[index] : solution.x[index]), 0);
}

export function solveShell({ mesh, t, E, nu, slaves, springs, shearSupports, load, maxIterations = 60 }) {
  const [first] = shearSupports;
  if (!first || !shearSupports.some(e => Math.hypot(e.x - first.x, e.y - first.y) > 1e-6)) {
    throw new Error('In-plane restraint requires shear stiffness at two distinct anchor locations.');
  }
  const d = t / 2;
  const length = Math.max(...mesh.xs.map(Math.abs), ...mesh.ys.map(Math.abs));
  const { terms, count } = shellEquations(mesh, slaves, d, length);
  const bw = Math.min(count, 5 * (mesh.nx + 2) - 1);
  const base = blocks(count, bw);
  const rig = plateRigidities(E, nu, t);
  for (const element of mesh.elements) assembleElement(base, terms, element, rig, t, E, nu);
  for (const support of shearSupports) for (const component of [0, 1]) {
    const map = interfaceShear(terms[support.node], d, component);
    add(base, map, map, support.k);
  }
  const free = new Float64Array(count);
  const external = [load.Vx, load.Vy, load.N, load.Mx / length, load.My / length, load.Mz / length];
  let active = springs.map(() => true);
  let solution, values, converged = false;
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const system = { A: base.A.clone(), B: base.B.map(c => c.slice()), C: base.C.map(r => r.slice()) };
    for (const [i, spring] of springs.entries()) {
      const map = terms[spring.node][2];
      add(system, map, map, spring.k * (active[i] ? 1 : inactiveStiffness));
    }
    const { A, B, C } = system;
    solution = solveBordered(A, B, C, free, external);
    values = terms.map(node => node.map(map => value(map, solution)));
    if (!values.every(node => node.every(Number.isFinite))) throw new Error('Shell displacements are non-finite.');
    const next = springs.map((spring, i) => {
      const opening = values[spring.node][2] * (spring.mode === 'compression' ? -1 : 1);
      return Math.abs(opening) <= displacementTolerance ? active[i] : opening > 0;
    });
    if (active.every((state, i) => state === next[i])) {
      converged = true;
      break;
    }
    active = next;
  }
  const w = Float64Array.from(values.map(node => node[2]));
  // Recover only the physical unilateral reactions. Residuals expose any load
  // transferred through numerical stabilization or an unfinished active set.
  const forces = springs.map(spring => {
    const opening = w[spring.node] * (spring.mode === 'compression' ? -1 : 1);
    return { ...spring, active: opening > 0, F: spring.k * Math.max(opening, 0) };
  });
  const anchors = shearSupports.map(support => {
    const [u, v, , bx, by] = values[support.node];
    return { ...support, Vx: support.k * (u - d * bx), Vy: support.k * (v - d * by) };
  });
  const residual = anchors.reduce((r, e) => ({
    Fx: r.Fx + e.Vx, Fy: r.Fy + e.Vy, Mz: r.Mz + e.x * e.Vy - e.y * e.Vx,
  }), { Fx: -load.Vx, Fy: -load.Vy, Mz: -load.Mz });
  const stresses = mesh.elements.map(element => {
    const DOFs = selection => element.nodes.flatMap(node => selection.map(dof => values[node][dof]));
    element.M = centreMoments(DOFs(bend), element.a, element.b, rig);
    element.vm = surfaceVonMises(element.M, t);
    return membraneStress(element.a, element.b, DOFs(membrane), E, nu);
  });
  const master = [solution.m[2], solution.m[3] / length, -solution.m[4] / length];
  return {
    w, forces, master, elements: mesh.elements, iterations: Math.min(iterations + 1, maxIterations),
    converged, dofs: count, bandwidth: bw, membrane: { anchors, residual, stresses, displacement: values },
  };
}
