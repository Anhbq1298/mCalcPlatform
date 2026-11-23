import { solveFlexible } from './connection-model.mjs';
import { solveMembrane } from './membrane.mjs';

export function solveSpatial(input, elements, concrete, actions, size) {
  const { N, Mx, My, Vx, Vy, Mz } = actions;
  const eq = solveFlexible(input, elements, concrete, N, Mx, { My, size });
  const { mesh } = eq.fem;
  let membrane;
  let shearIssue;
  const studs = elements.filter(element => element.kind === 'stud');
  if ([Vx, Vy, Mz].some(Boolean) && (input.options.friction || !studs.length || studs.some(e => !(e.shearK > 0)))) {
    shearIssue = 'Supply positive headed-stud shear stiffness and disable friction for the current shear model.';
  } else {
    const supports = studs.map(element => ({
      id: element.id, x: element.x, y: element.y, k: element.shearK,
      node: mesh.nodes.find(node => Math.hypot(node.x - element.x, node.y - element.y) <= 1e-6)?.id,
    }));
    try {
      membrane = solveMembrane({ mesh, slaves: eq.fem.slaves, supports, t: input.plate.t, load: [Vx, Vy, Mz] });
    } catch (error) {
      shearIssue = error.message;
    }
  }
  const residual = { ...eq.residual, ...membrane?.residual };
  const forceLimit = 0.05 + 1e-6 * Math.max(Math.hypot(N, Vx, Vy), eq.T, eq.C);
  const momentLimit = forceLimit * Math.max(input.plate.B, input.plate.H)
    + 1e-6 * Math.hypot(Mx, My, Mz);
  const balanced = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'].every(key =>
    Number.isFinite(residual[key]) && Math.abs(residual[key]) <= (key.startsWith('F') ? forceLimit : momentLimit));
  const finite = eq.fem.w.every(Number.isFinite) && Number.isFinite(eq.fem.vmMax) && Number.isFinite(eq.fem.pMax);
  return {
    ...eq, membrane, shearIssue, residual, balanced, forceLimit, momentLimit,
    analysisValid: finite && eq.fem.converged && balanced,
  };
}
