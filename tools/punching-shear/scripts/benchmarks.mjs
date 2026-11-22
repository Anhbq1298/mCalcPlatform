// Published punching shear examples re-run through the tool. Each benchmark gives the published input
// as tool input, the published values with their source, and how the tool value is read. Values the
// source computes under rules the tool does not implement (another National Annex, pre-A1:2014 text)
// are compared and flagged `basis: 'different'` with the reason.
// Run: node tools/punching-shear/scripts/benchmarks.mjs [--json]
import { cenDefaults } from '../src/inputs.mjs';
import { calculateDesign } from '../src/head.mjs';

const base = (values) => {
  const input = cenDefaults();
  return {
    ...input, ...values,
    slab: { ...input.slab, depthMode: 'explicit', xMin: -8000, xMax: 8000, yMin: -8000, yMax: 8000, ...values.slab },
    flexure: { ...input.flexure, areaMode: 'explicit', ...values.flexure },
    reinforcement: { ...input.reinforcement, anchorage: { ...input.reinforcement.anchorage, engaged: true } },
  };
};
const row = (result, id) => result.loads[0].rows.find(entry => entry.id === id);

export const BENCHMARKS = [
  {
    id: 'csi-safe-ec2-rc-pn-001',
    source: 'CSI, SAFE Software Verification, Example Eurocode 2-04 RC-PN-001, Slab punching shear design (Grid B-2, CEN default NA)',
    url: 'https://docs.csiamerica.com/manuals/safe/Verification/Design%20Verification/Eurocode%202-04/Eurocode%202-04%20RC-PN-001.pdf',
    input: base({
      column: { shape: 'rectangular', position: 'internal', cx: 300, cy: 900, rotation: 0, x: 0, y: 0 },
      slab: { h: 250, dx: 224, dy: 212 },
      // ρ_l = 0.004955 (average A_s of both layers over 8000 mm × d in the source).
      flexure: { asx: 0.004955 * 1000 * 224, asy: 0.004955 * 1000 * 212 },
      materials: { fck: 30, fyk: 500 },
      beta: { method: 'moment', confirmed: false, userValue: 1.15 },
      loads: [{ name: 'Grid B-2', V: 1112.197, Mx: 20.576, My: 41.593 }],
    }),
    values: [
      ['d', 'mm', 218, r => r.section.d],
      ['u_1', 'mm', 5139.468, r => r.u1],
      ['k', '', 1.9578, r => r.resistance.k],
      ['ρ_l', '', 0.004955, r => r.resistance.rho],
      ['v_min', 'MPa', 0.525, r => r.resistance.vMin],
      ['v_Rd,c', 'MPa', 0.5777, r => r.resistance.vRdc],
      ['v_Ed', 'MPa', 1.099, r => r.loads[0].vEd1, 'different', 'β: the source adds Eq. 6.39 terms of both axes, 1 + M2·u1/(V·W1,2) + M3·u1/(V·W1,3) = 1.1075 with k·M taken from SAFE; the tool uses Eq. 6.43 (SRSS, 1.8 factor) for biaxial moments, β = 1.0605.'],
      ['D/C = v_Ed/v_Rd,c', '', 1.90, r => row(r, 'concrete').ur, 'different', 'Follows v_Ed (β basis above).'],
    ],
  },
  {
    id: 'csi-safe-ec2-rc-pn-001-beta',
    source: 'Same CSI example, β = 1.1075 taken from the source as a user value, to compare the downstream stress and D/C',
    url: 'https://docs.csiamerica.com/manuals/safe/Verification/Design%20Verification/Eurocode%202-04/Eurocode%202-04%20RC-PN-001.pdf',
    input: null, // set below from the first CSI input
    values: [
      ['v_Ed', 'MPa', 1.099, r => r.loads[0].vEd1],
      ['D/C = v_Ed/v_Rd,c', '', 1.90, r => row(r, 'concrete').ur],
    ],
  },
  {
    id: 'jrc-eur26566-b2',
    source: 'European Commission JRC, Eurocode 2: Background & Applications — Design of concrete buildings, Worked examples, Report EUR 26566 EN (2014), §3.2.2.3 Punching shear — column B2',
    url: 'https://law.resource.org/pub/eu/eurocode/guidance/1110_WS_EC2.pdf',
    input: base({
      column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 },
      slab: { h: 210, dx: 172, dy: 156 },
      flexure: { asx: 0.0083 * 1000 * 172, asy: 0.0083 * 1000 * 156 },
      materials: { fck: 25, fyk: 500 },
      beta: { method: 'user', confirmed: false, userValue: 1.15 },
      loads: [{ name: 'B2', V: 705, Mx: 0, My: 0 }],
    }),
    values: [
      ['d', 'mm', 164, r => r.section.d],
      ['u_0', 'mm', 2000, r => r.u0],
      ['v_Ed,0 = βV/(u_0 d)', 'MPa', 2.47, r => row(r, 'max').demand],
      ['v_Rd,max', 'MPa', 3.6, r => r.vRdMax],
      ['u_1', 'mm', 4061, r => r.u1],
      ['v_Ed,1', 'MPa', 1.22, r => r.loads[0].vEd1],
      ['k', '', 2.0, r => r.resistance.k],
      ['v_Rd,c', 'MPa', 0.66, r => r.resistance.vRdc],
      ['v_min', 'MPa', 0.49, r => r.resistance.vMin],
      ['f_ywd,ef', 'MPa', 291, r => r.fywdEf],
      ['s_r', 'mm', 123, r => r.envelope.sr, 'different', 'The tool rounds 0.75d = 123 mm down to 120 mm.'],
      ['A_sw per perimeter', 'mm²', 830, r => r.envelope.aswReq, 'different', 'Scales with s_r: about 830 × 120/123 = 810 mm² (tool 807 with unrounded v_Ed,1).'],
      ['u_out,ef', 'mm', 7490, r => r.envelope.uOut],
      ['a_out (outer perimeter from the column face)', 'mm', 874, r => r.envelope.aOut],
      ['Design status', '', 'links OK', r => r.status, 'different', 'v_Ed,1 = 1.22 > k_max·v_Rd,c = 1.5 × 0.66 = 0.99 MPa: the A1:2014 limit (§6.4.5(1) Note) makes the tool Fail; the source does not apply it.'],
    ],
  },
  {
    id: 'dlubal-ve-1023',
    source: 'Dlubal, RFEM Verification Example 1023 — Punching shear design of a point-supported slab (DIN EN 1992-1-1), axis B/2, analytical solution',
    url: 'https://www.dlubal.com/en/downloads-and-information/examples-and-tutorials/verification-examples/001023',
    input: base({
      column: { shape: 'rectangular', position: 'internal', cx: 450, cy: 450, rotation: 0, x: 0, y: 0 },
      slab: { h: 240, dx: 190, dy: 190 },
      flexure: { asx: 0.005 * 1000 * 190, asy: 0.005 * 1000 * 190 },
      materials: { fck: 30, fyk: 500 },
      beta: { method: 'user', confirmed: false, userValue: 1.10 },
      loads: [{ name: 'B/2', V: 787.3, Mx: 0, My: 0 }],
    }),
    values: [
      ['u_1', 'mm', 4188, r => r.u1],
      ['v_Ed', 'MPa', 1.088, r => r.loads[0].vEd1],
    ],
  },
  {
    id: 'dlubal-ve-1028',
    source: 'Dlubal, RFEM 6 Verification Example 1028 — Punching shear design for central column in flat slab according to EC2 (DIN EN 1992-1-1), analytical solution column',
    url: 'https://www.dlubal.com/en/downloads-and-information/examples-and-tutorials/verification-examples/001028',
    input: base({
      column: { shape: 'circular', position: 'internal', diameter: 300, rotation: 0, x: 0, y: 0 },
      slab: { h: 240, dx: 210, dy: 210 },
      flexure: { asx: 0.005 * 1000 * 210, asy: 0.005 * 1000 * 210 },
      materials: { fck: 30, fyk: 500 },
      beta: { method: 'user', confirmed: false, userValue: 1.10 },
      loads: [{ name: 'Column', V: 500, Mx: 0, My: 0 }],
    }),
    values: [
      ['d', 'mm', 210, r => r.section.d],
      ['u_1', 'mm', 3581, r => r.u1],
      ['v_Ed', 'MPa', 0.731, r => r.loads[0].vEd1],
      ['k', '', 1.976, r => r.resistance.k],
      ['ρ_l', '', 0.005, r => r.resistance.rho],
      ['v_Rd,c', 'MPa', 0.585, r => r.resistance.vRdc],
      ['v_min', 'MPa', 0.532, r => r.resistance.vMin],
      ['Max. resistance with links', 'MPa', 0.819, r => row(r, 'kmax').resistance, 'different', 'DIN NA: 1.4·v_Rd,c; the tool uses the CEN value k_max = 1.5 (A1:2014).'],
      ['u_out,ef', 'mm', 5372, r => r.envelope.uOut, 'different', 'The source uses v_Rd,c with the required longitudinal reinforcement (DIN NA, 0.4875 MPa); the tool uses v_Rd,c of the provided reinforcement (Eq. 6.54).'],
    ],
  },
];

{
  const csi = BENCHMARKS[0].input;
  const u1 = 5139.468, V = 1112.197e3;
  const beta = 1 + 41.593e6 * u1 / (V * 2929744.957) + 20.576e6 * u1 / (V * 2271104.319);
  BENCHMARKS[1].input = { ...csi, beta: { method: 'user', confirmed: false, userValue: beta } };
}

export function runBenchmarks() {
  return BENCHMARKS.map(bench => {
    const result = calculateDesign(bench.input);
    const values = bench.values.map(([quantity, unit, published, read, basis = 'same', note = '']) => {
      const tool = read(result);
      const numeric = typeof published === 'number' && typeof tool === 'number';
      const diff = numeric ? (tool - published) / published : null;
      return { quantity, unit, published, tool, diff, basis, note };
    });
    return { id: bench.id, source: bench.source, url: bench.url, status: result.status, beta: result.loads?.[0]?.beta, values };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = runBenchmarks();
  if (process.argv.includes('--json')) console.log(JSON.stringify(data, null, 1));
  else for (const bench of data) {
    console.log(`\n${bench.id} (${bench.status})`);
    for (const v of bench.values) console.log(`  ${v.basis === 'same' ? '  ' : '* '}${v.quantity.padEnd(44)} pub ${String(v.published).padEnd(10)} tool ${typeof v.tool === 'number' ? v.tool.toFixed(4) : v.tool}  ${v.diff === null ? '' : (v.diff * 100).toFixed(2) + ' %'}`);
  }
}
