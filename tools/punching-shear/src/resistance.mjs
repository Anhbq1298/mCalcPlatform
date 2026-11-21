// Punching shear resistance and link detailing limits (EN 1992-1-1:2004 + AC:2010 + A1:2014,
// §6.4.4, §6.4.5, §9.4.3). CEN recommended values only. Units: mm, MPa, N.

export const CODE_PARAMETERS = {
  gammaC: 1.5, // §2.4.2.4
  gammaS: 1.15, // §2.4.2.4
  cRdcNumerator: 0.18, // C_Rd,c = 0.18/γc, §6.4.4(1)
  k1: 0.1, // §6.4.4(1), multiplies σ_cp
  rhoMax: 0.02, // Eq. 6.47
  kSizeMax: 2.0, // Eq. 6.47
  vRdMaxFactor: 0.4, // §6.4.5(3) after AC:2010: v_Rd,max = 0.4·ν·f_cd
  kMax: 1.5, // §6.4.5(1) Note, A1:2014: v_Ed ≤ k_max·v_Rd,c
  outerK: 1.5, // §6.4.5(4): outermost perimeter ≤ k·d inside u_out
  radialSpacing: 0.75, // §9.4.3(1): s_r ≤ 0.75d
  tangentialInside: 1.5, // §9.4.3(1): s_t ≤ 1.5d within the basic control perimeter
  tangentialOutside: 2.0, // §9.4.3(1): s_t ≤ 2d outside the basic control perimeter
  firstLayerMax: 0.5, // §9.4.3(4): first links ≤ d/2 from the loaded area
  firstLayerMin: 0.3, // The Concrete Centre detailing guidance (not a code limit)
  minimumLegFactor: 0.08, // Eq. 9.11
};

export function sizeEffect(d) {
  return Math.min(1 + Math.sqrt(200 / d), CODE_PARAMETERS.kSizeMax);
}

export function reinforcementRatio(asPerMetre, d) {
  return Math.min(asPerMetre / (1000 * d), CODE_PARAMETERS.rhoMax);
}

// Eq. 6.47: v_Rd,c = C_Rd,c·k·(100ρ_l f_ck)^(1/3) + k1·σ_cp ≥ v_min + k1·σ_cp, v_min from Eq. 6.3N.
// σ_cp = (σ_cy + σ_cz)/2 in MPa, compression positive.
export function concreteResistance({ fck, d, rhoX, rhoY, sigmaCp = 0, gammaC = CODE_PARAMETERS.gammaC }) {
  const k = sizeEffect(d);
  const rho = Math.min(Math.sqrt(rhoX * rhoY), CODE_PARAMETERS.rhoMax);
  const cRdc = CODE_PARAMETERS.cRdcNumerator / gammaC;
  const prestress = CODE_PARAMETERS.k1 * sigmaCp;
  const vRdcRaw = cRdc * k * Math.cbrt(100 * rho * fck) + prestress;
  const vMin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck);
  return { k, rho, cRdc, sigmaCp, vRdcRaw, vMin, vRdc: Math.max(vRdcRaw, vMin + prestress) };
}

// Eq. 6.53 limit: factor·ν·f_cd with ν = 0.6(1 − f_ck/250), Eq. 6.6N; factor from the code profile.
export function maximumResistance({ fck, gammaC = CODE_PARAMETERS.gammaC, factor = CODE_PARAMETERS.vRdMaxFactor }) {
  const nu = 0.6 * (1 - fck / 250);
  return factor * nu * (fck / gammaC);
}

// §6.4.5(1): f_ywd,ef = 250 + 0.25d ≤ f_ywd.
export function fywdEffective(fyk, d, gammaS = CODE_PARAMETERS.gammaS) {
  return Math.min(250 + 0.25 * d, fyk / gammaS);
}

// Eq. 6.52 with vertical links (sin α = 1).
export function reinforcedResistance({ vRdc, d, sr, asw, fywdEf, u1 }) {
  return 0.75 * vRdc + (1.5 * (d / sr) * asw * fywdEf) / (u1 * d);
}

// Eq. 6.52 rearranged for A_sw per perimeter.
export function requiredAswPerPerimeter({ vEd, vRdc, u1, sr, fywdEf }) {
  const excess = vEd - 0.75 * vRdc;
  if (excess <= 0) return 0;
  return (excess * u1 * sr) / (1.5 * fywdEf);
}

// Eq. 6.54: u_out,ef = β·V_Ed/(v_Rd,c·d). V in kN.
export function outerPerimeterLength({ beta, V, vRdc, d }) {
  return (beta * V * 1000) / (vRdc * d);
}

// Eq. 9.11 for vertical links: A_sw,min ≥ 0.08·√f_ck/f_yk · s_r·s_t/1.5.
export function minimumLegArea({ fck, fyk, sr, st }) {
  return (CODE_PARAMETERS.minimumLegFactor * Math.sqrt(fck) / fyk) * (sr * st) / 1.5;
}

export const barArea = diameter => (Math.PI * diameter * diameter) / 4;
