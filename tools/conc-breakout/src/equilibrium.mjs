// Rigid-plate equilibrium in the y–z plane. Forces in N, lengths in mm, moments in N·mm.
// Sign: N > 0 pulls the plate out of the concrete; M > 0 rotates the top (+y) outward.
// Tension elements (welded bars, and studs when shared) pull the plate inward at y_i;
// concrete bearing C pushes it outward at y_c. Equilibrium: ΣT − C = N and ΣT·y − C·y_c = M.
// Tension elements follow a linear strain field about the compression centre (plane sections,
// equal stiffness per unit area). This is a modelling assumption, reported as such.
import { E_PLATE, GAMMA } from './materials.mjs';

// EN 1993-1-8 §6.2.5 Eq. 6.5: additional bearing width c around a compressed flange.
export const bearingWidth = (t, fy, fjd) => t * Math.sqrt(fy / (3 * fjd * GAMMA.M0));

// Effective compression area around one flange (side = −1 bottom, +1 top), clipped to the plate.
export function flangeBearing({ plate, member }, fy, fjd, side = -1) {
  const c = bearingWidth(plate.t, fy, fjd);
  const outer = side * member.h / 2;
  const inner = side * (member.h / 2 - member.tf);
  const lo = Math.max(-plate.H / 2, Math.min(outer, inner) - c);
  const hi = Math.min(plate.H / 2, Math.max(outer, inner) + c);
  const yLo = side < 0 ? lo : Math.max(lo, 0);
  const yHi = side < 0 ? Math.min(hi, 0) : hi;
  const width = Math.min(plate.B, member.b + 2 * c);
  const length = yHi - yLo;
  return { c, width, length, area: width * length, y: (yLo + yHi) / 2, yLo, yHi, FcRd: fjd * width * length };
}

function distribute(elements, yC) {
  const active = elements.filter(e => e.y > yC);
  const S1 = active.reduce((sum, e) => sum + e.area * (e.y - yC), 0);
  const S2 = active.reduce((sum, e) => sum + e.area * (e.y - yC) * e.y, 0);
  return { active, S1, yT: S1 > 0 ? S2 / S1 : NaN };
}

function withForces(elements, yC, T, S1) {
  return elements.map(e => ({ ...e, F: e.y > yC && S1 > 0 ? T * e.area * (e.y - yC) / S1 : 0 }));
}

// Pure tension or small eccentricity: no bearing; linear field over all elements.
function tensionOnly(elements, N, M) {
  const A = elements.reduce((s, e) => s + e.area, 0);
  const Ay = elements.reduce((s, e) => s + e.area * e.y, 0);
  const Ayy = elements.reduce((s, e) => s + e.area * e.y * e.y, 0);
  const det = A * Ayy - Ay * Ay;
  if (!(Math.abs(det) > 1e-9)) return null;
  const a = (N * Ayy - M * Ay) / det;
  const b = (A * M - Ay * N) / det;
  const forces = elements.map(e => ({ ...e, F: e.area * (a + b * e.y) }));
  if (forces.some(e => e.F < -1e-6)) return null;
  return forces;
}

function finish(result, N, M) {
  const T = result.tensions.reduce((s, e) => s + e.F, 0);
  const Ty = result.tensions.reduce((s, e) => s + e.F * e.y, 0);
  const yT = T > 0 ? Ty / T : null;
  const residual = { Fz: T - result.C - N, Mx: Ty - result.C * (result.yC ?? 0) - M };
  return { ...result, T, yT, lever: yT !== null && result.yC !== null ? yT - result.yC : null, residual };
}

export function solveComponent(input, elements, fy, fjd, N, M) {
  const bottom = flangeBearing(input, fy, fjd, -1);
  const top = flangeBearing(input, fy, fjd, 1);
  const base = { method: 'component', bearing: bottom, bearingTop: top };
  if (N <= 0) {
    // All-compression: both flange zones bear, no tension needed if both reactions are ≥ 0.
    // Cbot + Ctop = −N and −(Cbot·y_b + Ctop·y_t) = M.
    const arm = top.y - bottom.y;
    const Cbot = (M - N * top.y) / arm;
    const Ctop = -N - Cbot;
    if (N < 0 && Ctop >= 0 && Cbot >= 0) {
      return finish({ ...base, allCompression: true, C: -N, yC: M / N,
        Cbot, Ctop, tensions: elements.map(e => ({ ...e, F: 0 })) }, N, M);
    }
  }
  const { S1, yT } = distribute(elements, bottom.y);
  if (!(S1 > 0)) return finish({ ...base, unsupported: 'No tension element lies above the compression centre.', C: 0, yC: bottom.y, tensions: elements.map(e => ({ ...e, F: 0 })) }, N, M);
  const C = (M - N * yT) / (yT - bottom.y);
  if (C < 0) {
    const forces = tensionOnly(elements, N, M);
    if (!forces) return finish({ ...base, unsupported: 'Tension with small eccentricity puts some elements in compression; not covered.', C: 0, yC: null, tensions: elements.map(e => ({ ...e, F: 0 })) }, N, M);
    return finish({ ...base, tensionOnly: true, C: 0, yC: null, tensions: forces }, N, M);
  }
  const T = N + C;
  return finish({ ...base, C, yC: bottom.y, Cbot: C, Ctop: 0, tensions: withForces(elements, bottom.y, T, S1) }, N, M);
}

// Rectangular stress block f_jd over the full plate width from the bottom edge.
export function solveBlock(input, elements, fjd, N, M) {
  const { B, H } = input.plate;
  const base = { method: 'block' };
  const Cmax = fjd * B * H;
  if (N <= 0) {
    const x = -N / (fjd * B);
    if (x <= H && M <= -N * (H / 2 - x / 2)) {
      const yC = M / N; // resultant position, ≤ 0
      return finish({ ...base, allCompression: true, C: -N, yC, x, block: { x, width: B, area: B * x },
        tensions: elements.map(e => ({ ...e, F: 0 })) }, N, M);
    }
  }
  const residual = x => {
    const yC = -H / 2 + x / 2;
    const { S1, yT } = distribute(elements, yC);
    if (!(S1 > 0)) return { f: NaN };
    const C = fjd * B * x;
    return { f: (N + C) * yT - C * yC - M, yC, S1, C };
  };
  let lo = 1e-6;
  let hi = H;
  const fHi = residual(hi);
  if (!(fHi.f >= 0)) {
    return finish({ ...base, unsupported: Number.isNaN(fHi.f) ? 'No tension element above the compression block.'
      : 'Bearing over the full plate cannot resist the actions (block depth would exceed the plate).',
      C: Cmax, yC: 0, x: H, block: { x: H, width: B, area: B * H }, tensions: elements.map(e => ({ ...e, F: 0 })) }, N, M);
  }
  const fLo = residual(lo);
  if (fLo.f > 0) {
    const forces = tensionOnly(elements, N, M);
    if (forces) return finish({ ...base, tensionOnly: true, C: 0, yC: null, tensions: forces }, N, M);
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const value = residual(mid);
    if (value.f > 0) hi = mid; else lo = mid;
    if (hi - lo < 1e-9) break;
  }
  const x = (lo + hi) / 2;
  const { yC, S1, C } = residual(x);
  return finish({ ...base, C, yC, x, block: { x, width: B, area: B * x },
    tensions: withForces(elements, yC, N + C, S1) }, N, M);
}

// Engineering indicator (not a code rule): plate cantilever stiffness at a bar row against the
// axial stiffness of the bars in that row. Low ratios mean plate bending changes the force split.
export function stiffnessRatio({ leff, t, m, nBars, area, le }) {
  const kPlate = 3 * E_PLATE * (leff * t ** 3 / 12) / m ** 3;
  const kBars = nBars * 200000 * area / le;
  return { kPlate, kBars, ratio: kPlate / kBars, D: E_PLATE * t ** 3 / (12 * (1 - 0.3 ** 2)) };
}
