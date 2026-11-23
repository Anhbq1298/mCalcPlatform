// Rectangular-mesh plate on point springs with an optional rigid master (the welded steel member).
// w > 0 is displacement out of the concrete. Spring modes: 'tension' acts for w > 0 (bars, studs),
// 'compression' for w < 0 (concrete bearing), 'both' always. One-sided springs are solved by an
// active-set iteration; an inactive spring keeps 1e-9 of its stiffness for numerical stability.
// Master DOFs m = [w0, φ, ψ]: slave node w = w0 + φ·y + ψ·x, βx = −ψ, βy = −φ.
import { bandMatrix, solveBordered } from './banded.mjs';
import { centreMoments, elementStiffness, plateRigidities, surfaceVonMises } from './mitc4.mjs';

const INACTIVE = 1e-9;

export function createMesh(xs, ys) {
  const nx = xs.length;
  const nodes = [];
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < nx; i++) nodes.push({ id: nodes.length, i, j, x: xs[i], y: ys[j] });
  const elements = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const n1 = j * nx + i;
    elements.push({ nodes: [n1, n1 + 1, n1 + nx + 1, n1 + nx], a: (xs[i + 1] - xs[i]) / 2, b: (ys[j + 1] - ys[j]) / 2,
      x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 });
  }
  // Tributary area of each node (a quarter of each adjacent element).
  const area = new Float64Array(nodes.length);
  for (const e of elements) for (const n of e.nodes) area[n] += e.a * e.b;
  return { xs, ys, nx, ny: ys.length, nodes, elements, area };
}

export function solvePlate({ mesh, t, E, nu, slaves = new Set(), springs = [], masterLoad = [0, 0, 0], nodeLoads = [], maxIterations = 60, allActive = false }) {
  const rig = plateRigidities(E, nu, t);
  const nN = mesh.nodes.length;
  const eq = new Int32Array(3 * nN).fill(-1);
  let n = 0;
  for (let node = 0; node < nN; node++) if (!slaves.has(node)) for (let d = 0; d < 3; d++) eq[3 * node + d] = n++;
  // Map a global DOF to its equation terms: [[index, coefficient, isMaster]].
  const terms = (node, d) => {
    if (!slaves.has(node)) return [[eq[3 * node + d], 1, false]];
    const { x, y } = mesh.nodes[node];
    return d === 0 ? [[0, 1, true], [1, y, true], [2, x, true]] : d === 1 ? [[2, -1, true]] : [[1, -1, true]];
  };
  let bw = 0;
  for (const e of mesh.elements) {
    const ids = e.nodes.flatMap(node => [0, 1, 2].map(d => eq[3 * node + d])).filter(v => v >= 0);
    if (ids.length) bw = Math.max(bw, Math.max(...ids) - Math.min(...ids));
  }
  const base = bandMatrix(n, bw);
  const p = slaves.size ? 3 : 0; // master DOFs exist only when nodes are tied to it
  const baseB = Array.from({ length: p }, () => new Float64Array(n));
  const baseC = Array.from({ length: p }, () => new Array(p).fill(0));
  const addTerm = (A, B, C, ti, tj, value) => {
    const [i, ci, mi] = ti;
    const [j, cj, mj] = tj;
    const v = value * ci * cj;
    if (!mi && !mj) { if (i >= j) A.add(i, j, v); }
    else if (mi && mj) C[i][j] += v;
    else if (mi) B[i][j] += v; // master row i, free column j
  };
  for (const e of mesh.elements) {
    e.K = elementStiffness(e.a, e.b, rig);
    const local = e.nodes.flatMap(node => [0, 1, 2].map(d => terms(node, d)));
    for (let p = 0; p < 12; p++) for (let q = 0; q < 12; q++) {
      const value = e.K[12 * p + q];
      if (value === 0) continue;
      for (const ti of local[p]) for (const tj of local[q]) addTerm(base, baseB, baseC, ti, tj, value);
    }
  }
  const f = new Float64Array(n);
  const g = masterLoad.slice(0, p);
  for (const { node, Fz } of nodeLoads) for (const [i, c, m] of terms(node, 0)) { if (m) g[i] += c * Fz; else f[i] += c * Fz; }

  const active = springs.map(s => allActive || s.mode !== 'tension');
  let solution;
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const A = base.clone();
    const B = baseB.map(column => Float64Array.from(column));
    const C = baseC.map(row => [...row]);
    springs.forEach((s, k) => {
      const kk = s.k * (active[k] ? 1 : INACTIVE);
      const tw = terms(s.node, 0);
      for (const ti of tw) for (const tj of tw) addTerm(A, B, C, ti, tj, kk);
    });
    solution = solveBordered(A, B, C, f, g);
    const w = nodeW(solution, terms, nN);
    let changed = false;
    springs.forEach((s, k) => {
      const next = s.mode === 'both' ? true : s.mode === 'tension' ? w[s.node] > 0 : w[s.node] < 0;
      if (next !== active[k]) { active[k] = next; changed = true; }
    });
    if (!changed) break;
  }
  const values = (node, d) => terms(node, d).reduce((s, [i, c, m]) => s + c * (m ? solution.m[i] : solution.x[i]), 0);
  const w = Float64Array.from({ length: nN }, (_, node) => values(node, 0));
  const forces = springs.map((s, k) => ({ ...s, active: active[k], F: (active[k] ? 1 : INACTIVE) * s.k * w[s.node] * (s.mode === 'compression' ? -1 : 1) }));
  for (const e of mesh.elements) {
    const u = e.nodes.flatMap(node => [values(node, 0), values(node, 1), values(node, 2)]);
    e.M = centreMoments(u, e.a, e.b, rig);
    e.vm = surfaceVonMises(e.M, t);
  }
  return { w, master: solution.m, forces, elements: mesh.elements, iterations: iterations + 1, converged: iterations < maxIterations, dofs: n, bandwidth: bw };
}

function nodeW(solution, terms, nN) {
  const w = new Float64Array(nN);
  for (let node = 0; node < nN; node++) w[node] = terms(node, 0).reduce((s, [i, c, m]) => s + c * (m ? solution.m[i] : solution.x[i]), 0);
  return w;
}

// Grid lines: all key coordinates, then each interval subdivided to spacing ≤ h.
export function gridLines(lo, hi, keys, h) {
  const points = [...new Set([lo, hi, ...keys.filter(v => v > lo && v < hi)].map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
  const out = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const span = points[k] - points[k - 1];
    if (span < 1e-6) continue;
    const parts = Math.max(1, Math.ceil(span / h - 1e-9));
    for (let p = 1; p <= parts; p++) out.push(points[k - 1] + span * p / parts);
  }
  return out;
}
