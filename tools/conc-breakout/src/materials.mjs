// Material values. EN 1992-1-1:2004 Table 3.1, §3.1.6, §8.4.2; EN 1992-4:2018 Table 4.1;
// EN 1993-1-8 §6.2.5. Units: MPa (N/mm²).
import { PLATE_GRADES } from './inputs.mjs';

export const GAMMA = { c: 1.5, s: 1.15, M0: 1.0, M2: 1.25, Mc: 1.5, MsRe: 1.15 };
export const E_STEEL = 200000; // reinforcing steel, EN 1992-1-1 §3.2.7(4)
export const E_PLATE = 210000; // structural steel, EN 1993-1-1 §3.2.6

export function concreteProps(fck, alphaCc) {
  const fcm = fck + 8;
  const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + fcm / 10);
  const fctk005 = 0.7 * fctm;
  return {
    fck, fcm, fctm, fctk005,
    fcd: alphaCc * fck / GAMMA.c, // Eq. 3.15
    fctd: 1.0 * fctk005 / GAMMA.c, // Eq. 3.16, α_ct = 1.0 (recommended)
    nuPrime: 1 - fck / 250, // Eq. 6.57N
  };
}

// EN 1992-4 Table 4.1, persistent and transient situations.
export function studFactors(fuk, fyk) {
  const ratio = fuk / fyk;
  return {
    MsN: Math.max(1.2 * ratio, 1.4),
    MsV: fuk <= 800 && fyk / fuk <= 0.8 ? Math.max(1.0 * ratio, 1.25) : 1.5,
    Mc: GAMMA.Mc, // γ_c · γ_inst, γ_inst = 1.0 for headed fasteners
    Mp: GAMMA.Mc,
  };
}

export function plateProps(grade) {
  return { ...PLATE_GRADES[grade] };
}

// EN 1992-1-1 Eq. 8.2: f_bd = 2.25 η1 η2 f_ctd.
export function bondStrength(concrete, diameter, goodBond) {
  const eta1 = goodBond ? 1.0 : 0.7;
  const eta2 = diameter <= 32 ? 1.0 : (132 - diameter) / 100;
  return { eta1, eta2, fbd: 2.25 * eta1 * eta2 * concrete.fctd };
}

// EN 1993-1-8 Eq. 6.6 with F_Rdu from EN 1992-1-1 Eq. 6.63 written as α·f_cd·A_c0.
export const jointStrength = (concrete, betaJ, alpha) => betaJ * alpha * concrete.fcd;
