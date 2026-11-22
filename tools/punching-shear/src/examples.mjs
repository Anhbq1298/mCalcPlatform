import { cenDefaults } from './inputs.mjs';
// Worked cases covering the scope of the tool, grouped below into six cards. Each is a partial input merged over the
// defaults by restoreInputs. `expect` is the overall status the case is built to show; the unit
// tests assert it so that a change in engineering behaviour is noticed.
const confirmed = { beta: { method: 'simplified', confirmed: true, userValue: 1.15 } };
const engaged = { reinforcement: { mode: 'auto', diameter: 10, shape: 'single', legGap: 100, layers: [], anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: true } } };
const slab = (h, d, extra = {}) => ({ slab: { h, depthMode: 'explicit', dx: d + 5, dy: d - 5, cover: 25, xMin: -6000, xMax: 6000, yMin: -6000, yMax: 6000, ...extra } });
const head = values => ({ head: { enabled: true, shape: 'rectangular', lx: 1500, ly: 1500, diameter: 1500, thickness: 400, ...values } });

const CASE_LIST = [
  {
    id: 'internal-plain', title: '1 · Internal column, no links', expect: 'Pass',
    note: 'v_Ed ≤ v_Rd,c at u1; only the face check applies.',
    input: { ...confirmed, ...engaged, ...slab(250, 210), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 450, Mx: 0, My: 0 }] },
  },
  {
    id: 'internal-links', title: '2 · Internal column, auto links (CSI RC-PN-001)', expect: 'Pass',
    note: 'Benchmark geometry: 300 × 900 column, h = 250, d = 218, auto single-leg links.',
    input: { ...confirmed, ...engaged, flexure: { areaMode: 'explicit', asx: 1090, asy: 1090 }, loads: [{ name: 'ULS 1', V: 800, Mx: 0, My: 0 }] },
  },
  {
    id: 'internal-moment', title: '2b · Rectangular column, biaxial moments (Eq. 6.43)', expect: 'Pass',
    note: 'β from M_x and M_y by Eq. 6.43; the stress figure shows the plastic distribution of Fig. 6.19.',
    input: { ...engaged, beta: { method: 'moment', confirmed: false, userValue: 1.15 }, ...slab(250, 210), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 600, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 600, Mx: 50, My: 90 }] },
  },
  {
    id: 'circular-moment', title: '3 · Circular column, β from moments (Eq. 6.42)', expect: 'Pass',
    note: 'Resultant eccentricity of both moments; links designed automatically.',
    input: { ...engaged, beta: { method: 'moment', confirmed: false, userValue: 1.15 }, ...slab(280, 240), column: { shape: 'circular', position: 'internal', diameter: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1570, asy: 1570, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 850, Mx: 40, My: 60 }] },
  },
  {
    id: 'edge', title: '4 · Edge column, β = u1/u1* + k·e·u1/W1', expect: 'Pass',
    note: 'Face flush with the slab edge X max; moment toward the interior and along the edge.',
    input: { ...engaged, beta: { method: 'moment', confirmed: false, userValue: 1.4 }, ...slab(280, 240, { xMax: 200 }), column: { shape: 'rectangular', position: 'edge', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1570, asy: 1570, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 420, Mx: 20, My: -40 }] },
  },
  {
    id: 'corner', title: '5 · Corner column, simplified β = 1.5', expect: 'Pass',
    note: 'Faces flush with X max and Y max; links follow the two free edges.',
    input: { ...confirmed, ...engaged, ...slab(280, 240, { xMax: 200, yMax: 200 }), column: { shape: 'rectangular', position: 'corner', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1570, asy: 1570, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 220, Mx: 0, My: 0 }] },
  },
  {
    id: 'opening', title: '6 · Internal column, opening within 6d', expect: 'Pass',
    note: 'Tangent sector removed from u1, u_out and every link layer (§6.4.2(3)).',
    input: { ...confirmed, ...engaged, ...slab(250, 210), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, openings: [{ x: 900, y: 0, w: 300, h: 400 }], loads: [{ name: 'ULS 1', V: 620, Mx: 0, My: 0 }] },
  },
  {
    id: 'two-openings', title: '7 · Two openings, overlapping shadows', expect: 'Pass',
    note: 'Shadows are merged, not added: overlapping parts are removed once.',
    input: { ...confirmed, ...engaged, ...slab(250, 210), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, openings: [{ x: 850, y: 250, w: 300, h: 300 }, { x: 900, y: -200, w: 300, h: 300 }], loads: [{ name: 'ULS 1', V: 600, Mx: 0, My: 0 }] },
  },
  {
    id: 'drop-small', title: '8 · Drop with l_H ≤ 2h_H (Fig. 6.17)', expect: 'Pass',
    note: 'Single section in the slab at r_cont = min(Eq. 6.34, Eq. 6.35).',
    input: { ...confirmed, ...engaged, ...slab(250, 210), ...head({ lx: 1000, ly: 1000, thickness: 450 }), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 700, Mx: 0, My: 0 }] },
  },
  {
    id: 'drop-small-links', title: '8b · Rectangular head l_H ≤ 2h_H with links (mapped)', expect: 'Pass',
    note: 'Check on the EC2 equivalent circle, links on the head outline, mapped by 22.5° sectors. Tool method (not an EC2 rule), results by that method; see Help.',
    input: { ...confirmed, ...engaged, ...slab(250, 210), ...head({ lx: 1000, ly: 1000, thickness: 450 }), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 900, Mx: 0, My: 0 }] },
  },
  {
    id: 'drop-large', title: '9 · Drop with l_H > 2h_H, links inside the drop', expect: 'Pass',
    note: 'Sections inside the drop (d_H, 2d_H from the column) and in the slab (2d from the drop edge).',
    input: { ...confirmed, ...engaged, ...slab(250, 210), ...head({ lx: 2400, ly: 2400, thickness: 400 }), column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 1250, Mx: 0, My: 0 }] },
  },
  {
    id: 'drop-through', title: '9 · Drop with l_H > 2h_H (Fig. 6.18)', expect: 'Pass',
    note: 'Two sections: inside the drop (d_H, around the column) and the slab beyond it (d, around the drop). Links go where the layout needs them, here in both.',
    input: { ...confirmed, ...engaged, ...slab(250, 210), ...head({ lx: 2000, ly: 2000, thickness: 400 }), column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 1400, Mx: 0, My: 0 }] },
  },
  {
    id: 'drop-circular', title: '10 · Circular column and head (Eq. 6.36/6.37)', expect: 'Pass',
    note: 'The circular case is stated in §6.4.2(11); no interpretation flag.',
    input: { ...confirmed, ...engaged, ...slab(250, 210), ...head({ shape: 'circular', diameter: 2200, thickness: 400 }), column: { shape: 'circular', position: 'internal', diameter: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 900, Mx: 0, My: 0 }] },
  },
  {
    id: 'prestressed-sg', title: '11 · Post-tensioned slab, Singapore NA', expect: 'Pass',
    note: 'σ_cp = 1.5 MPa in both directions (k1 = 0.1); v_Rd,max = 0.5νf_cd, k_max = 2.0.',
    input: { ...confirmed, ...engaged, code: { edition: 'EN 1992-1-1:2004 + AC:2010 + A1:2014', profile: 'sg', naConfirmed: true }, ...slab(250, 210), materials: { fck: 40, fyk: 500 }, prestress: { sigmaX: 1.5, sigmaY: 1.5 }, column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 900, asy: 900, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 950, Mx: 0, My: 0 }] },
  },
  {
    id: 'provided-fail', title: '12 · Provided layout too light', expect: 'Fail',
    note: 'Check-provided mode: two layers of 8 × Ø8 single legs do not reach the required A_sw.',
    input: {
      ...confirmed, ...slab(250, 210), column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 },
      flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 800, Mx: 0, My: 0 }],
      reinforcement: { mode: 'provided', diameter: 10, shape: 'single', legGap: 100, anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: true }, groups: [{ count: 1, spacing: 80, diameter: 8, shape: 'single', links: 8 }, { count: 1, spacing: 155, diameter: 8, shape: 'single', links: 8 }], omitted: {} },
    },
  },
  {
    id: 'edge-drop', title: 'Edge column with drop', expect: 'Pass',
    note: 'Drop clipped at the slab edge. Inside: edge column with d_H (Fig. 6.15); outside: the clipped drop as an edge loaded area at 2d. Geometric extension, see Help.',
    input: { ...confirmed, ...engaged, ...slab(250, 210, { xMax: 250 }), ...head({ lx: 2400, ly: 2400, thickness: 400 }), beta: { method: 'simplified', confirmed: true, userValue: 1.4 }, column: { shape: 'rectangular', position: 'edge', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 600, Mx: 0, My: 0 }] },
  },
  {
    id: 'corner-drop', title: 'Corner column with drop', expect: 'Pass',
    note: 'Drop clipped at both slab edges. Inside: corner column with d_H (Fig. 6.20); outside: the clipped drop as a corner loaded area at 2d.',
    input: { ...confirmed, ...engaged, ...slab(250, 210, { xMax: 250, yMax: 250 }), ...head({ lx: 2400, ly: 2400, thickness: 400 }), beta: { method: 'simplified', confirmed: true, userValue: 1.5 }, column: { shape: 'rectangular', position: 'corner', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, flexure: { areaMode: 'explicit', asx: 1340, asy: 1340, phiX: 16, phiY: 16, sX: 150, sY: 150, outer: 'x' }, loads: [{ name: 'ULS 1', V: 300, Mx: 0, My: 0 }] },
  },
];
// Cases fill unset groups from the CEN basis they were built on, not from the current UI defaults.
const BASE = cenDefaults();
export const CASES = CASE_LIST.map(item => ({
  ...item,
  input: { code: BASE.code, slab: BASE.slab, beta: BASE.beta, ...item.input },
}));

const byId = Object.fromEntries(CASES.map(item => [item.id, item]));

// Six cards: interior, edge and corner, each without and with a drop. A card only loads a starting
// design; everything else (drop geometry class, openings, where links go) follows from the inputs and
// is reported in the results. The remaining CASES are reference cases for tests.
const card = (id, title, position, drop, example) => ({ id, title, position, drop, variants: [{ ...byId[example], label: title }] });
export const EXAMPLE_CARDS = [
  card('interior', 'Interior', 'internal', false, 'internal-moment'),
  card('edge', 'Edge', 'edge', false, 'edge'),
  card('corner', 'Corner', 'corner', false, 'corner'),
  card('interior-drop', 'Interior + drop', 'internal', true, 'drop-through'),
  card('edge-drop', 'Edge + drop', 'edge', true, 'edge-drop'),
  card('corner-drop', 'Corner + drop', 'corner', true, 'corner-drop'),
];

// The card starting designs.
export const EXAMPLES = EXAMPLE_CARDS.flatMap(item => item.variants.map(entry => ({ ...entry, card: item.id })));
export const exampleById = id => byId[id];
