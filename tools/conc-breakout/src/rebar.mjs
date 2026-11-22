// Welded reinforcing bars: steel, bar-to-plate weld, plate punching around the bar and anchorage.
// Units: N, mm, MPa.
import { bondStrength, GAMMA } from './materials.mjs';

export const barArea = d => Math.PI * d * d / 4;

// Fillet weld all round a bar standing on the plate. EN 1993-1-8 §4.5.3.3 simplified method,
// Eq. 4.4, with f_u the lower of the plate and the bar (f_t = k·f_yk). Weld procedure and
// weldability of the reinforcing steel must satisfy EN ISO 17660-1; that is not calculated here.
export function weldResistance({ d, throat, plateFu, betaW, fyk, k }) {
  const fu = Math.min(plateFu, k * fyk);
  const fvwd = fu / Math.sqrt(3) / (betaW * GAMMA.M2);
  const length = Math.PI * d;
  return { fu, fvwd, length, FRd: fvwd * throat * length };
}

// Shear through the plate thickness around the weld toe (punching of the plate by the bar).
export function platePunching({ d, throat, t, fy }) {
  const perimeter = Math.PI * (d + 2 * Math.SQRT2 * throat);
  return { perimeter, FRd: perimeter * t * fy / (Math.sqrt(3) * GAMMA.M0) };
}

// EN 1992-1-1 §8.4: basic and design anchorage length for the actual bar stress σ_sd.
export function anchorage({ d, sigma, concrete, goodBond, shape, cd, provided }) {
  const bond = bondStrength(concrete, d, goodBond);
  const lbRqd = d / 4 * sigma / bond.fbd; // Eq. 8.3
  const alpha1 = shape === 'bent' && cd > 3 * d ? 0.7 : 1.0; // Table 8.2
  const lbMin = Math.max(0.3 * lbRqd, 10 * d, 100); // Eq. 8.6
  const lbd = Math.max(alpha1 * lbRqd, lbMin); // Eq. 8.4 with α2–α5 = 1.0 (conservative)
  return { ...bond, lbRqd, alpha1, lbMin, lbd, provided, ratio: lbd / provided };
}

// EN 1992-1-1 Table 8.1N minimum mandrel diameter.
export const minMandrel = d => (d <= 16 ? 4 : 7) * d;

export function barChecks(bar, { rebars, plate, plateGrade, concrete }) {
  const area = barArea(bar.d);
  const fyd = rebars.fyk / GAMMA.s;
  const steel = { area, fyd, FRd: area * fyd };
  const weld = weldResistance({ d: bar.d, throat: rebars.throat, plateFu: plateGrade.fu, betaW: plateGrade.betaW, fyk: rebars.fyk, k: rebars.k });
  const punch = platePunching({ d: bar.d, throat: rebars.throat, t: plate.t, fy: plateGrade.fy });
  const sigma = bar.F / area;
  const anchor = bar.F > 0 ? anchorage({ d: bar.d, sigma, concrete, goodBond: rebars.goodBond,
    shape: rebars.shape, cd: rebars.cd, provided: rebars.length }) : null;
  return { ...bar, area, sigma, steel, weld, punch, anchor };
}
