// Load increment factor β and punching shear stress demand (EN 1992-1-1:2004 §6.4.3).
// Units: V in kN, M in kN·m, lengths in mm, stresses in MPa.
// Sign convention: M_x acts about the global x-axis and gives an eccentricity along y (e_y = M_x/V);
// M_y acts about the global y-axis and gives an eccentricity along x (e_x = M_y/V). β uses |e|.
import { basicPerimeter, sectionModulusCircular, sectionModulusRect } from './geometry.mjs';

// Table 6.1: k for internal rectangular columns, linear interpolation, clamped outside 0.5…3.0.
const K_TABLE = [[0.5, 0.45], [1.0, 0.6], [2.0, 0.7], [3.0, 0.8]];
export const K_CIRCULAR = 0.6;
export const BETA_SIMPLIFIED_INTERNAL = 1.15; // §6.4.3(6), Figure 6.21N

export function kInternalRect(c1, c2) {
  const ratio = c1 / c2;
  if (ratio <= K_TABLE[0][0]) return K_TABLE[0][1];
  for (let i = 1; i < K_TABLE.length; i += 1) {
    const [x0, y0] = K_TABLE[i - 1];
    const [x1, y1] = K_TABLE[i];
    if (ratio <= x1) return y0 + ((ratio - x0) / (x1 - x0)) * (y1 - y0);
  }
  return K_TABLE[K_TABLE.length - 1][1];
}

// Global moments → eccentricities along the column's local axes (mm).
export function localEccentricities(column, V, Mx, My) {
  const ex = (My / V) * 1000; // along global x
  const ey = (Mx / V) * 1000; // along global y
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  return { e1: ex * Math.cos(theta) + ey * Math.sin(theta), e2: -ex * Math.sin(theta) + ey * Math.cos(theta) };
}

// Uniaxial Eq. 6.39 (rectangular) or Eq. 6.42 (circular). axis 'x' = eccentricity along local x.
export function betaMomentUniaxial(column, d, V, M, axis = 'x') {
  if (M === 0) return 1;
  const e = Math.abs((M / V) * 1000);
  if (column.shape === 'circular') return 1 + (K_CIRCULAR * e * basicPerimeter(column, d)) / sectionModulusCircular(column.diameter, d);
  const c1 = axis === 'x' ? column.cx : column.cy;
  const c2 = axis === 'x' ? column.cy : column.cx;
  return 1 + (kInternalRect(c1, c2) * e * basicPerimeter(column, d)) / sectionModulusRect(c1, c2, d);
}

// Moment-based β for internal columns with any combination of M_x and M_y.
// Circular: the section is axisymmetric, so Eq. 6.42 applies to the resultant eccentricity.
// Rectangular, one local eccentricity: Eq. 6.39. Both: Eq. 6.43. The standard pairs e_y with b_z;
// whether the subscript names the eccentricity direction or the moment axis is not stated
// unambiguously, so both readings are evaluated and the larger β is used.
export function betaMoment(column, d, V, Mx, My) {
  const { e1, e2 } = localEccentricities(column, V, Mx, My);
  const tol = 1e-9;
  if (Math.abs(e1) < tol && Math.abs(e2) < tol) return { value: 1, method: 'No moment: β = 1.', terms: { e1, e2 } };
  if (column.shape === 'circular') {
    const e = Math.hypot(e1, e2);
    const value = 1 + K_CIRCULAR * Math.PI * e / (column.diameter + 4 * d);
    return { value, method: 'Eq. 6.42, resultant eccentricity', terms: { e1, e2, e } };
  }
  if (Math.abs(e2) < tol || Math.abs(e1) < tol) {
    const along = Math.abs(e2) < tol ? 'x' : 'y';
    const e = along === 'x' ? e1 : e2;
    const c1 = along === 'x' ? column.cx : column.cy;
    const c2 = along === 'x' ? column.cy : column.cx;
    const k = kInternalRect(c1, c2);
    const u1 = basicPerimeter(column, d);
    const W1 = sectionModulusRect(c1, c2, d);
    return { value: 1 + (k * Math.abs(e) * u1) / W1, method: 'Eq. 6.39, Table 6.1', terms: { e1, e2, k, u1, W1, c1, c2 } };
  }
  const b1 = column.cx + 4 * d;
  const b2 = column.cy + 4 * d;
  const same = 1 + 1.8 * Math.hypot(e1 / b1, e2 / b2);
  const crossed = 1 + 1.8 * Math.hypot(e1 / b2, e2 / b1);
  return {
    value: Math.max(same, crossed),
    method: 'Eq. 6.43, larger of both axis pairings',
    terms: { e1, e2, b1, b2, betaParallel: same, betaCrossed: crossed },
  };
}

// v_Ed = β·V_Ed/(u·d), Eq. 6.38. V in kN → N.
export function shearDemand({ V, beta, u, d }) {
  return (beta * V * 1000) / (u * d);
}
