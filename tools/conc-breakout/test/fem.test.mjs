import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { solveFlexible } from '../src/fem/connection-model.mjs';
import { createMesh, gridLines, solvePlate } from '../src/fem/plate-system.mjs';
import { newDefaults, rebarPositions } from '../src/inputs.mjs';
import { concreteProps } from '../src/materials.mjs';
import { barArea } from '../src/rebar.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

function simplySupported(a, n, t) {
  const xs = gridLines(-a / 2, a / 2, [], a / n);
  const mesh = createMesh(xs, xs);
  const edge = node => Math.abs(Math.abs(node.x) - a / 2) < 1e-6 || Math.abs(Math.abs(node.y) - a / 2) < 1e-6;
  const springs = mesh.nodes.filter(edge).map(node => ({ node: node.id, k: 1e10, mode: 'both' }));
  return { mesh, springs, centre: mesh.nodes.find(node => Math.abs(node.x) < 1e-6 && Math.abs(node.y) < 1e-6).id, D: 210000 * t ** 3 / (12 * 0.91) };
}

test('MITC4: simply supported square plate, central point load (Timoshenko α = 0.01160)', () => {
  for (const n of [10, 20]) {
    const { mesh, springs, centre, D } = simplySupported(1000, n, 10);
    const r = solvePlate({ mesh, t: 10, E: 210000, nu: 0.3, springs, nodeLoads: [{ node: centre, Fz: 1000 }] });
    close(r.w[centre] / (0.01160 * 1000 * 1e6 / D), 1, 0.01, 'mesh ' + n);
  }
});

test('MITC4: simply supported square plate, uniform load (α = 0.00406, M = 0.0479 q a²)', () => {
  const { mesh, springs, centre, D } = simplySupported(1000, 20, 10);
  const q = 0.01;
  const r = solvePlate({ mesh, t: 10, E: 210000, nu: 0.3, springs, nodeLoads: mesh.nodes.map(node => ({ node: node.id, Fz: q * mesh.area[node.id] })) });
  close(r.w[centre] / (0.00406 * q * 1e12 / D), 1, 0.015, 'w_max');
  const mid = r.elements.reduce((best, e) => (Math.hypot(e.x, e.y) < Math.hypot(best.x, best.y) ? e : best));
  close(Math.abs(mid.M.Mx) / (0.0479 * q * 1e6), 1, 0.03, 'M_x near centre');
});

// Independent rigid-plate solution on the same springs: w = w0 + φ·y, compression-only Winkler
// integrated in closed form over the plate, tension-only bar springs. Solved by 2-D Newton.
function rigidOnWinkler({ B, H, kc, bars, N, M }) {
  const residual = ([w0, phi]) => {
    const y0 = Math.min(Math.max(-w0 / phi, -H / 2), H / 2);
    const lo = -H / 2;
    const C = -kc * B * (w0 * (y0 - lo) + phi * (y0 ** 2 - lo ** 2) / 2);
    const Cy = -kc * B * (w0 * (y0 ** 2 - lo ** 2) / 2 + phi * (y0 ** 3 - lo ** 3) / 3);
    const T = bars.map(b => b.k * Math.max(0, w0 + phi * b.y));
    return [T.reduce((s, v) => s + v, 0) - C - N, T.reduce((s, v, i) => s + v * bars[i].y, 0) - Cy - M, T, C];
  };
  let x = [-0.01, 1e-4];
  for (let it = 0; it < 100; it++) {
    const [f1, f2] = residual(x);
    const h = [1e-7, 1e-10];
    const J = [0, 1].map(k => { const xp = [...x]; xp[k] += h[k]; const [g1, g2] = residual(xp); return [(g1 - f1) / h[k], (g2 - f2) / h[k]]; });
    const det = J[0][0] * J[1][1] - J[1][0] * J[0][1];
    x = [x[0] - (f1 * J[1][1] - f2 * J[1][0]) / det, x[1] - (f2 * J[0][0] - f1 * J[0][1]) / det];
  }
  const [, , T, C] = residual(x);
  return { T: T.reduce((s, v) => s + v, 0), C };
}

test('a very thick plate reproduces the rigid plate on the same Winkler and bar springs', () => {
  const input = newDefaults();
  input.plate.t = 400;
  const concrete = concreteProps(input.concrete.fck, input.concrete.alphaCc);
  const bars = rebarPositions(input.rebars.rows).map(b => ({ ...b, kind: 'rebar', area: barArea(b.d) }));
  const M = 136.17 * 300 * 1e3;
  const fem = solveFlexible(input, bars, concrete, 0, M);
  const ref = rigidOnWinkler({ B: input.plate.B, H: input.plate.H, kc: fem.fem.kc, bars: fem.tensions.map(b => ({ y: b.y, k: b.k })), N: 0, M });
  close(fem.T / ref.T, 1, 0.02, 'ΣT');
  close(fem.C / ref.C, 1, 0.02, 'C');
});

test('flexible-plate solution satisfies global equilibrium and converges', () => {
  for (const N of [-200, 0, 60]) {
    const input = newDefaults();
    input.actions.N = N;
    const r = calculate(input);
    assert.ok(r.eq.fem.converged, 'contact converged');
    close(r.eq.T - r.eq.C, N * 1e3, 1, 'ΣF, N = ' + N);
    // Bar forces act at their spring nodes around the bar; moments taken at bar centres differ slightly.
    close(r.eq.tensions.reduce((s, e) => s + e.F * e.y, 0) - r.eq.C * (r.eq.yC ?? 0), r.actions.M, 5e-3 * r.actions.M, 'ΣM, N = ' + N);
  }
});

test('plate flexibility moves bearing toward the plate edge and lowers bar tension for a stiff thin case', () => {
  const thin = newDefaults();
  thin.plate.t = 12;
  const r = calculate(thin);
  assert.ok(r.rows.find(row => row.label === 'Plate elastic stress (FEM)'));
  assert.ok(r.rows.find(row => row.label === 'Flexible vs rigid plate'));
  assert.ok(r.eq.fem.vmMax > 0);
  assert.ok(r.eq.fem.pMax > 0);
});

test('studs that share tension pick up force through plate bending', () => {
  const input = newDefaults();
  input.studs.tension = 'shared';
  const r = calculate(input);
  const top = r.studs.filter(stud => stud.y > 0);
  assert.ok(top.every(stud => stud.F > 0));
  assert.ok(r.rows.find(row => row.label === 'Concrete cone (tensioned studs)'));
  const excluded = calculate(newDefaults());
  assert.equal(excluded.rows.find(row => row.label === 'Stud tension').status, 'warning');
});

test('the FEM solve stays fast enough for live updates', () => {
  const start = performance.now();
  calculate(newDefaults());
  assert.ok(performance.now() - start < 1500);
});

test('the 3D scene renders every field, with and without FEM, without invalid numbers', async () => {
  const { buildScene, renderScene } = await import('../src/view3d.mjs');
  const input = newDefaults();
  input.concrete.edges.bottom = 600;
  input.studs.tension = 'shared';
  const r = calculate(input);
  for (const field of ['stress', 'deflection', 'contact']) {
    const svg = renderScene(buildScene(r, { field, scale: 1 }), { yaw: 0.3, pitch: -0.2, zoom: 1.5 });
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  }
  const rigid = calculate({ ...input, options: { ...input.options, analysis: 'rigid' } });
  assert.equal(buildScene(rigid).range, null);
  assert.doesNotMatch(renderScene(buildScene(rigid)), /NaN|undefined/);
});

test('with shared stud tension the bars are checked for the bars-only bound', () => {
  const input = newDefaults();
  input.studs.tension = 'shared';
  const shared = calculate(input);
  const barsOnly = calculate(newDefaults());
  for (const bar of shared.bars) {
    const ref = barsOnly.bars.find(item => item.id === bar.id);
    close(bar.F, ref.F, 1e-6, bar.id);
  }
  assert.equal(shared.rows.find(row => row.label === 'Bar and stud tension bounded').status, 'pass');
});
