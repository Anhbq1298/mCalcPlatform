import { shankArea } from './anchors.mjs';
import { meshSize } from './fem/connection-model.mjs';
import { solveSpatial } from './fem/spatial.mjs';
import { transformLoads } from './loads.mjs';
import { resolveLayout } from './layout.mjs';
import { concreteProps, jointStrength, plateProps, studFactors } from './materials.mjs';
import { barArea, barChecks } from './rebar.mjs';
import { barVerification, engineeringStatus, information, plateVerification, studChecks } from './spatial-checks.mjs';

function compareMeshes(primary, coarse) {
  if (!primary.analysisValid || !coarse.analysisValid) return null;
  const tension = Math.max(Math.abs(primary.C - coarse.C),
    ...primary.tensions.map((anchor, index) => Math.abs(anchor.F - coarse.tensions[index].F)));
  const shear = Math.max(0, ...primary.membrane.anchors.map((anchor, index) => {
    const other = coarse.membrane.anchors[index];
    return Math.hypot(anchor.Vx - other.Vx, anchor.Vy - other.Vy);
  }));
  const scale = Math.max(primary.C, ...primary.tensions.map(e => e.F),
    ...primary.membrane.anchors.map(e => Math.hypot(e.Vx, e.Vy)), 1);
  return { tension, shear, ratio: Math.max(tension, shear) / scale };
}

export function calculateSpatial(input) {
  const { concrete: c, plate, options: o, rebars, studs: s, loading } = input;
  const loadingResult = transformLoads(loading.point, loading.applied);
  const loads = loadingResult.internal;
  const layout = resolveLayout(input);
  const concrete = concreteProps(c.fck, c.alphaCc);
  const grade = plateProps(plate.grade);
  const gammas = studFactors(s.fuk, s.fyk);
  const fjd = jointStrength(concrete, o.betaJ, o.alpha);
  const rebarElements = layout.bars.map(b => ({ ...b, kind: 'rebar', area: barArea(b.d), axialK: b.axialStiffness ?? rebars.axialStiffness }));
  const studElements = layout.studs.map(p => ({
    ...p, kind: 'stud', d: s.d, area: shankArea(s.d), axialK: p.axialStiffness ?? s.axialStiffness, shearK: p.shearStiffness ?? s.shearStiffness,
  }));
  const elements = [...rebarElements, ...studElements];
  if (elements.some(e => e.axialK != null && !(Number.isFinite(e.axialK) && e.axialK > 0))) {
    throw new Error('Enter a positive axial stiffness for each override.');
  }
  const h = o.meshSize ?? Math.max(meshSize(plate), Math.max(plate.B, plate.H) / 35);
  if (!Number.isFinite(h) || h <= 0) throw new Error('Enter a positive mesh size.');
  const eq = solveSpatial(input, elements, concrete, loads, h);
  let meshIssue;
  try {
    eq.meshComparison = compareMeshes(eq, solveSpatial(input, elements, concrete, loads, h * 1.45));
  } catch (error) {
    meshIssue = error.message;
  }
  const normal = new Map(eq.tensions.map(anchor => [anchor.id, anchor]));
  const shear = new Map(eq.membrane?.anchors.map(anchor => [anchor.id, anchor]));
  const bars = rebarElements.map(bar => barChecks({ ...bar, ...normal.get(bar.id), Vx: 0, Vy: 0 },
    { rebars, plate, plateGrade: grade, concrete }));
  const studs = studElements.map(stud => {
    const inPlane = shear.get(stud.id);
    return { ...stud, ...normal.get(stud.id), Vx: inPlane?.Vx ?? 0, Vy: inPlane?.Vy ?? 0 };
  });
  const group = 'Analysis validity';
  const rows = [
    information(group, 'Six-component equilibrium', eq.analysisValid ? 'pass' : 'incomplete',
      (eq.shearIssue ? eq.shearIssue + ' ' : '') + Object.entries(eq.residual).map(([axis, value]) =>
        axis + ' = ' + value.toExponential(2) + (axis.startsWith('F') ? ' N' : ' N·mm')).join(' · ')
      + ' · contact ' + (eq.fem.converged ? 'converged' : 'iteration limit reached') + ' (' + eq.fem.iterations + ' iterations).',
      'Statics and unilateral spring compatibility'),
    information(group, 'Mesh sensitivity', eq.meshComparison?.ratio <= 0.05 ? 'pass' : 'incomplete',
      eq.meshComparison ? 'Largest anchor or bearing resultant change ' + (eq.meshComparison.ratio * 100).toFixed(2)
        + '% against 1.45× coarser mesh. The screening threshold is 5% of the governing reaction.'
        : (meshIssue ?? 'Two equilibrated meshes are required.'), 'Force-resultant sensitivity screen'),
    information(group, 'Analysis model validation', 'incomplete',
      (eq.coupled ? 'Coupled shell with shear at the concrete interface. ' : 'Out-of-plane solve. In-plane restraint is unverified. ')
      + 'Verify axial and shear stiffness, nonlinear anchor interaction and local effects at the load-introduction points.',
      'Model scope and benchmark record'),
    information('Load path', 'Transfer into the receiving member', 'incomplete',
      'Resolve concrete bearing into struts and nodal zones. Trace anchor forces into developed reinforcement ties. Verify confinement, laps, splitting and member actions.',
      'EN 1992-1-1:2004 §6.5, §8.4 and §8.7'),
  ];
  if (eq.analysisValid) rows.push(...plateVerification(eq, grade, fjd, plate.t), ...barVerification(input, bars), ...studChecks(input, studs, eq, gammas, loads));
  return {
    input, layout, concrete, grade, fjd, gammas, eq, bars, studs, rows, loadingResult,
    actions: { N: loads.N, V: -loads.Vy, M: loads.Mx },
    status: engineeringStatus(rows),
  };
}
