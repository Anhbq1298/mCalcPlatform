// Rectangular bilinear plane-stress membrane with a rigid member footprint.
// DOFs at each free node are u and v. At tied nodes u = U − yθ, v = V + xθ.
import { bandMatrix, solveBordered } from './banded.mjs';

const gauss = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function strainMatrix(a, b, xi, eta) {
  const matrix = [[], [], []];
  for (const [sx, sy] of signs) {
    const dx = sx * (1 + sy * eta) / (4 * a);
    const dy = sy * (1 + sx * xi) / (4 * b);
    matrix[0].push(dx, 0);
    matrix[1].push(0, dy);
    matrix[2].push(dy, dx);
  }
  return matrix;
}

function stress([ex, ey, gamma], E, nu) {
  const scale = E / (1 - nu * nu);
  return [scale * (ex + nu * ey), scale * (ey + nu * ex), E * gamma / (2 * (1 + nu))];
}

export function membraneStiffness(a, b, t, E, nu) {
  const K = new Float64Array(64);
  for (const xi of gauss) for (const eta of gauss) {
    const B = strainMatrix(a, b, xi, eta);
    for (let j = 0; j < 8; j++) {
      const sigma = stress(B.map(row => row[j]), E, nu);
      for (let i = 0; i < 8; i++) {
        K[i * 8 + j] += B.reduce((sum, row, k) => sum + row[i] * sigma[k], 0) * a * b * t;
      }
    }
  }
  return K;
}

export function membraneStress(a, b, displacements, E, nu, xi = 0, eta = 0) {
  return stress(strainMatrix(a, b, xi, eta).map(row =>
    row.reduce((sum, value, index) => sum + value * displacements[index], 0)), E, nu);
}

export function solveMembrane({ mesh, slaves, supports, t, E = 210000, nu = 0.3, load }) {
  const [Vx, Vy, Mz] = load;
  if (!load.some(Boolean)) return { anchors: [], residual: { Fx: 0, Fy: 0, Mz: 0 }, stresses: [] };
  const first = supports[0];
  if (!first || !supports.some(item => Math.hypot(item.x - first.x, item.y - first.y) > 1e-6)) {
    throw new Error('In-plane restraint requires shear stiffness at two distinct anchor locations.');
  }
  if (supports.some(item => !Number.isFinite(item.k) || item.k <= 0)) {
    throw new Error('Each resisting anchor needs a positive finite shear stiffness.');
  }
  const length = Math.max(...mesh.xs.map(Math.abs), ...mesh.ys.map(Math.abs));
  let size = 0;
  const free = mesh.nodes.map(node => {
    if (slaves.has(node.id)) return -1;
    size += 2;
    return size - 2;
  });
  const terms = mesh.nodes.map(({ id, x, y }) => free[id] >= 0
    ? [[[free[id], 1, false]], [[free[id] + 1, 1, false]]]
    : [[[0, 1, true], [2, -y / length, true]], [[1, 1, true], [2, x / length, true]]]);
  const A = bandMatrix(size, Math.min(size, 2 * (mesh.nx + 1) + 1));
  const B = Array.from({ length: 3 }, () => new Float64Array(size));
  const C = Array.from({ length: 3 }, () => [0, 0, 0]);
  function assemble(left, right, value) {
    for (const [i, ci, mi] of left) for (const [j, cj, mj] of right) {
      const contribution = ci * cj * value;
      if (mi && mj) C[i][j] += contribution;
      else if (mi) B[i][j] += contribution;
      else if (!mj && i >= j) A.add(i, j, contribution);
    }
  }
  for (const element of mesh.elements) {
    const local = element.nodes.flatMap(node => terms[node]);
    const K = membraneStiffness(element.a, element.b, t, E, nu);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) assemble(local[i], local[j], K[i * 8 + j]);
  }
  for (const item of supports) for (const dof of terms[item.node]) assemble(dof, dof, item.k);
  const { x, m } = solveBordered(A, B, C, new Float64Array(size), [Vx, Vy, Mz / length]);
  const displacement = terms.map(node => node.map(dof => dof.reduce((sum, [i, c, master]) =>
    sum + c * (master ? m[i] : x[i]), 0)));
  if (!displacement.flat().every(Number.isFinite)) throw new Error('Membrane displacements are non-finite.');
  const anchors = supports.map(item => ({
    ...item, Vx: item.k * displacement[item.node][0], Vy: item.k * displacement[item.node][1],
  }));
  const residual = anchors.reduce((r, anchor) => ({
    Fx: r.Fx + anchor.Vx,
    Fy: r.Fy + anchor.Vy,
    Mz: r.Mz + anchor.x * anchor.Vy - anchor.y * anchor.Vx,
  }), { Fx: -Vx, Fy: -Vy, Mz: -Mz });
  const stresses = mesh.elements.map(element => membraneStress(element.a, element.b,
    element.nodes.flatMap(node => displacement[node]), E, nu));
  return { anchors, residual, stresses, displacement };
}
