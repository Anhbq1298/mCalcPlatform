// Code basis shown in the UI and report. CEN recommended values only; no National Annex.
import { CODE_PARAMETERS as P } from './resistance.mjs';
import { BETA_SIMPLIFIED_INTERNAL } from './demand.mjs';

export const PROFILE = {
  standard: 'EN 1992-1-1:2004 + AC:2010 + A1:2014, §6.4 punching and §9.4.3 detailing',
  nationalAnnex: 'None selected: CEN recommended values',
  parameters: [
    { name: 'γc', value: P.gammaC, source: '§2.4.2.4', status: 'Recommended value' },
    { name: 'γs', value: P.gammaS, source: '§2.4.2.4', status: 'Recommended value' },
    { name: 'C_Rd,c', value: P.cRdcNumerator / P.gammaC, source: '§6.4.4(1)', status: 'Recommended value' },
    { name: 'v_min', value: '0.035·k^1.5·√f_ck', source: '§6.4.4(1), Eq. 6.3N', status: 'Recommended value' },
    { name: 'v_Rd,max', value: '0.4·ν·f_cd', source: '§6.4.5(3), AC:2010', status: 'Recommended value' },
    { name: 'k_max', value: P.kMax, source: '§6.4.5(1) Note, A1:2014', status: 'Recommended value' },
    { name: 'β simplified, internal', value: BETA_SIMPLIFIED_INTERNAL, source: '§6.4.3(6), Fig. 6.21N', status: 'Recommended value' },
    { name: 'k (outer perimeter)', value: P.outerK, source: '§6.4.5(4)', status: 'Recommended value' },
    { name: 'Eq. 9.11 factor', value: P.minimumLegFactor, source: '§9.4.3(2)', status: 'Code value' },
  ],
  assumptions: [
    'Internal column; all perimeters and link layers lie inside the slab and clear of openings.',
    'σ_cp = 0 (no in-plane axial force or prestress).',
    'ρ_lx and ρ_ly are taken from the entered reinforcement per metre and assumed uniform over c + 3d each side.',
    'Vertical links (α = 90°). f_ywd,ef = 250 + 0.25d ≤ f_ywd.',
    'Eq. 6.52 uses the smallest layer A_sw and the largest radial spacing between layers.',
    'Moments are the unbalanced moments transferred at the column centroid. M_x acts about x (e_y = M_x/V); M_y acts about y (e_x = M_y/V).',
  ],
  unsupported: [
    'Edge and corner columns, perimeter clipping at free edges, and openings within 6d or the reinforcement zone.',
    'Load reduction inside the control perimeter (§6.4.4(2)) and column bases.',
    'Prestress or in-plane axial force (σ_cp).',
    'National Annex parameters other than the CEN recommended values.',
    'Link anchorage and bend geometry (reported as Requires confirmation).',
  ],
};
