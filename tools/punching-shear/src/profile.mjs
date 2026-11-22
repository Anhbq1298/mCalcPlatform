// Code parameter profiles shown in the UI and report. CEN recommended values are the default.
// The UK profile changes the NDPs below; its values come from secondary sources and must be
// confirmed by the user against the NA to BS EN 1992-1-1 before results can be reported as checked.
import { CODE_PARAMETERS as P } from './resistance.mjs';

const common = [
  { name: 'γc', value: P.gammaC, source: '§2.4.2.4', status: 'Recommended value' },
  { name: 'γs', value: P.gammaS, source: '§2.4.2.4', status: 'Recommended value' },
  { name: 'C_Rd,c', value: P.cRdcNumerator / P.gammaC, source: '§6.4.4(1)', status: 'Recommended value' },
  { name: 'k1', value: P.k1, source: '§6.4.4(1)', status: 'Recommended value' },
  { name: 'v_min', value: '0.035·k^1.5·√f_ck', source: '§6.4.4(1), Eq. 6.3N', status: 'Recommended value' },
  { name: 'β simplified (internal, edge, corner)', value: '1.15, 1.4, 1.5', source: '§6.4.3(6), Fig. 6.21N', status: 'Recommended value' },
  { name: 'k (outer perimeter)', value: P.outerK, source: '§6.4.5(4)', status: 'Recommended value' },
  { name: 'Eq. 9.11 factor', value: P.minimumLegFactor, source: '§9.4.3(2)', status: 'Code value' },
];

export const PROFILES = {
  cen: {
    id: 'cen', label: 'CEN recommended values', nationalAnnex: 'None selected: CEN recommended values',
    vRdMaxFactor: 0.4, kMax: 1.5, kMaxLabel: 'k_max·v_Rd,c (§6.4.5(1) Note, A1:2014)', needsConfirmation: false,
    parameters: [
      ...common,
      { name: 'v_Rd,max', value: '0.4·ν·f_cd', source: '§6.4.5(3), AC:2010', status: 'Recommended value' },
      { name: 'k_max', value: P.kMax, source: '§6.4.5(1) Note, A1:2014', status: 'Recommended value' },
    ],
  },
  sg: {
    id: 'sg', label: 'Singapore National Annex (confirm values)', nationalAnnex: 'NA to SS EN 1992-1-1:2008 + A1:2010 (Singapore)',
    vRdMaxFactor: 0.5, kMax: 2.0, kMaxLabel: 'v_Ed ≤ 2·v_Rd,c at u1 (SG NA 6.4.5(3))', needsConfirmation: true, fckShearCap: 50,
    parameters: [
      ...common.map(entry => ({ ...entry, status: 'Default EN per SG NA (6.4.3(6), 6.4.4(1)); confirm' })),
      { name: 'v_Rd,max', value: '0.5·ν·f_cd', source: 'SG NA 6.4.5(3)', status: 'SCIA SG NA table and Table NA.1 copy; confirm' },
      { name: 'Limit at u1', value: '2·v_Rd,c', source: 'SG NA 6.4.5(3)', status: 'SCIA SG NA table and Table NA.1 copy; confirm' },
      { name: 'C_max for shear', value: 'C50/60 (f_ck ≤ 50 MPa in shear)', source: 'SG NA 3.1.2(2)P', status: 'SCIA SG NA table; confirm' },
      { name: 'α_cc for shear', value: 1.0, source: 'SG NA 3.1.6(1)P', status: 'SCIA SG NA table; confirm' },
    ],
  },
  uk: {
    id: 'uk', label: 'UK National Annex (confirm values)', nationalAnnex: 'NA to BS EN 1992-1-1 (UK), values from secondary sources',
    vRdMaxFactor: 0.5, kMax: 2.0, kMaxLabel: 'v_Ed ≤ 2·v_Rd,c at u1 (UK NA 6.4.5(3))', needsConfirmation: true,
    parameters: [
      ...common.map(entry => ({ ...entry, status: 'Assumed equal to CEN; confirm in the UK NA' })),
      { name: 'v_Rd,max', value: '0.5·ν·f_cd', source: 'UK NA 6.4.5(3)', status: 'Secondary sources (CADS report, The Concrete Centre); confirm' },
      { name: 'Limit at u1 with links', value: '2·v_Rd,c', source: 'UK NA 6.4.5(3)', status: 'Secondary sources (CADS report, The Concrete Centre); confirm' },
    ],
  },
};

export const ASSUMPTIONS = [
  'Edge and corner columns: rectangular, faces flush with the slab edges; Fig. 6.15 perimeters and Fig. 6.20 u1*.',
  'σ_cp = (σ_cy + σ_cz)/2 from the entered in-plane stresses (compression positive).',
  'ρ_lx and ρ_ly from the entered reinforcement per metre, assumed uniform over c + 3d each side.',
  'Vertical links (α = 90°). f_ywd,ef = 250 + 0.25d ≤ f_ywd.',
  'Eq. 6.52 uses the smallest effective layer A_sw and the largest radial spacing between layers.',
  'Eccentricities e_x = M_y/V_Ed and e_y = M_x/V_Ed give the position of the punching force resultant relative to the column centroid.',
  'Openings within 6d remove the sector between the tangents from the column centre (Fig. 6.14) from every check perimeter and link layer, and from u0 of internal columns.',
  'Outer perimeters u_out,ef follow the same clipped shape as u1.',
  'Links are assumed to enclose the top and bottom flexural bars (§8.5, §9.4.3); the tool does not check this.',
];

export const UNSUPPORTED = [
  'Edge or corner columns whose faces are not flush with the slab edges, and circular columns at edges.',
  'Edge and corner columns with the load eccentricity toward the slab exterior (Eq. 6.39 with the edge perimeter).',
  'Deduction of loads inside the control perimeter: EN 1992-1-1 gives V_Ed,red (Eq. 6.48) for column bases only; column bases are not covered.',
  'National Annexes other than the CEN values and the UK and Singapore profiles.',
];

export function profileFor(id) {
  const profile = PROFILES[id] ?? PROFILES.cen;
  return { ...profile, standard: 'EN 1992-1-1:2004 + AC:2010 + A1:2014, §6.4 punching, §8.3, §8.5 and §9.3.2, §9.4.3 detailing', assumptions: ASSUMPTIONS, unsupported: UNSUPPORTED };
}
