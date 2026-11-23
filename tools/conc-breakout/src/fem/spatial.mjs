import { solveFlexible } from './connection-model.mjs';

export function solveSpatial(input, elements, concrete, actions, size) {
  const { N, Mx, My, Vx, Vy, Mz } = actions;
  const studs = elements.filter(element => element.kind === 'stud');
  const hasShear = [Vx, Vy, Mz].some(Boolean);
  const valid = studs.every(e => Number.isFinite(e.shearK) && e.shearK > 0);
  const distinct = studs.some(e => Math.hypot(e.x - studs[0].x, e.y - studs[0].y) > 1e-6);
  const withShell = !input.options.friction && valid && distinct;
  let shearIssue = hasShear && !withShell
    ? 'The shear model requires positive shear stiffness at two distinct headed studs and excludes friction.' : undefined;
  let eq;
  try {
    eq = solveFlexible(input, elements, concrete, N, Mx, { My, size, Vx, Vy, Mz, supports: withShell ? studs : [] });
  } catch (error) {
    if (!withShell) throw error;
    shearIssue = error.message;
    eq = solveFlexible(input, elements, concrete, N, Mx, { My, size });
  }
  const membrane = eq.membrane ?? (!hasShear && !shearIssue ? {
    anchors: [], residual: { Fx: 0, Fy: 0, Mz: 0 }, stresses: [],
  } : null);
  const residual = { ...eq.residual, ...membrane?.residual };
  const forceLimit = 0.05 + 1e-6 * Math.max(Math.hypot(N, Vx, Vy), eq.T, eq.C);
  const momentLimit = forceLimit * Math.max(input.plate.B, input.plate.H)
    + 1e-6 * Math.hypot(Mx, My, Mz);
  const balanced = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'].every(key =>
    Number.isFinite(residual[key]) && Math.abs(residual[key]) <= (key.startsWith('F') ? forceLimit : momentLimit));
  const finite = eq.fem.w.every(Number.isFinite) && Number.isFinite(eq.fem.vmMax) && Number.isFinite(eq.fem.pMax);
  return {
    ...eq, coupled: Boolean(eq.membrane), membrane, shearIssue, residual, balanced, forceLimit, momentLimit,
    analysisValid: finite && eq.fem.converged && balanced,
  };
}
