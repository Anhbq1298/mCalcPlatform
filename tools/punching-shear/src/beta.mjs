// Load increment factor β by column position (EN 1992-1-1 §6.4.3).
// Eccentricity convention: e_x = M_y/V_Ed and e_y = M_x/V_Ed (mm) locate the punching force
// resultant relative to the column centroid.
import { betaMoment, kInternalRect } from './demand.mjs';
import { sectionModulusEdge } from './position.mjs';
import { STATES } from './inputs.mjs';

export const BETA_SIMPLIFIED = { internal: 1.15, edge: 1.4, corner: 1.5 }; // §6.4.3(6), Fig. 6.21N
const TOL = 1e-6; // mm

export function betaFor(ctx, load) {
  const { input, position, d, u1, u1Star, shadows } = ctx;
  const method = input.beta.method;
  if (method === 'simplified') return { value: BETA_SIMPLIFIED[position.kind], method: `§6.4.3(6) simplified value for ${position.kind} columns (braced, spans ≤ 25 %, ticked by the user)` };
  if (method === 'user') return { value: input.beta.userValue, method: 'User-defined value (not calculated by the tool)' };
  const ex = (load.My / load.V) * 1000;
  const ey = (load.Mx / load.V) * 1000;
  if (position.kind === 'internal') {
    const beta = betaMoment(input.column, d, load.V, load.Mx, load.My);
    if (shadows.length && beta.value > 1) {
      return { ...beta, note: `${load.name}: β uses the unreduced W1 (W1 for a perimeter reduced by openings is not defined in EN 1992-1-1; see Help).` };
    }
    return beta;
  }
  const blocked = shadows.length ? { note: `${load.name}: β uses the unreduced u1* (u1* near openings is not defined in EN 1992-1-1; see Help).` } : {};
  if (position.kind === 'edge') {
    const n = position.normals[0];
    const ePerp = ex * n.x + ey * n.y;
    const ePar = Math.abs(-ex * n.y + ey * n.x);
    if (ePerp < -TOL) {
      return { value: NaN, method: 'Eq. 6.39 with the edge perimeter (not implemented)', state: STATES.unsupportedLoading, message: `${load.name}: the eccentricity points toward the slab edge; EN 1992-1-1 then applies Eq. 6.39 with the edge perimeter, which is not implemented.` };
    }
    const base = u1 / u1Star;
    if (ePar < TOL) return { value: base, method: 'β = u1/u1* (§6.4.3(4), eccentricity toward the interior)', terms: { ePerp, ePar, u1Star }, ...blocked };
    const k = kInternalRect(position.c1, 2 * position.c2);
    const W1 = sectionModulusEdge(position.c1, position.c2, d);
    return { value: base + (k * ePar * u1) / W1, method: 'Eq. 6.44, k from Table 6.1 with c1/2c2, W1 from Eq. 6.45', terms: { ePerp, ePar, u1Star, k, W1 }, ...blocked };
  }
  const [n1, n2] = position.normals;
  if (ex * n1.x + ey * n1.y < -TOL || ex * n2.x + ey * n2.y < -TOL) {
    return { value: NaN, method: 'Eq. 6.39 with the corner perimeter (not implemented)', state: STATES.unsupportedLoading, message: `${load.name}: the eccentricity points toward a slab edge; EN 1992-1-1 then applies Eq. 6.39 with the corner perimeter, which is not implemented.` };
  }
  return { value: u1 / u1Star, method: 'Eq. 6.46, β = u1/u1* (eccentricity toward the interior)', terms: { u1Star }, ...blocked };
}
