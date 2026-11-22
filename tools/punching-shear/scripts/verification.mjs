// Verification report data: every reference case through the engine, and three worked examples
// recomputed by hand from EN 1992-1-1 formulas written out here, independently of src/, then
// compared with the tool. Run: node tools/punching-shear/scripts/verification.mjs [--json]
import { CASES, exampleById } from '../src/examples.mjs';
import { calculateDesign } from '../src/head.mjs';

const round = (v, n = 3) => (Number.isFinite(v) ? Number(v.toFixed(n)) : null);

// EN 1992-1-1 §6.4.4 (1), Eq. 6.47 and 6.3N, CEN recommended values, no prestress.
function concrete({ d, dx, dy, asx, asy, fck }) {
  const k = Math.min(2, 1 + Math.sqrt(200 / d));
  const rho = Math.min(0.02, Math.sqrt((asx / (1000 * dx)) * (asy / (1000 * dy))));
  const vRdc = Math.max(0.18 / 1.5 * k * Math.cbrt(100 * rho * fck), 0.035 * k ** 1.5 * Math.sqrt(fck));
  return { k, rho, vRdc };
}
// §6.4.5(3), Eq. 6.53 with ν = 0.6(1 − fck/250) and the 0.4 factor (A1:2014 recommended value).
const vRdMax = fck => 0.4 * 0.6 * (1 - fck / 250) * fck / 1.5;

export function handExamples() {
  const out = [];
  {
    // 1 · Internal column 400 × 400, h 250, dx 215 / dy 205, H16@150 both ways (1340 mm²/m), V 450 kN, β 1.15.
    const d = (215 + 205) / 2, c1 = 400, c2 = 400, V = 450e3, beta = 1.15, fck = 30;
    const { k, rho, vRdc } = concrete({ d, dx: 215, dy: 205, asx: 1340, asy: 1340, fck });
    const u0 = 2 * (c1 + c2), u1 = 2 * (c1 + c2) + 4 * Math.PI * d;
    const v0 = beta * V / (u0 * d), v1 = beta * V / (u1 * d);
    const tool = calculateDesign(exampleById('internal-plain').input);
    const row = id => tool.loads[0].rows.find(entry => entry.id === id);
    out.push({ id: 'internal-plain', title: 'Internal column without links', rows: [
      ['d = (d_x + d_y)/2', 'mm', d, tool.section.d],
      ['k = 1 + √(200/d) ≤ 2', '', k, tool.resistance.k],
      ['ρ_l = √(ρ_x·ρ_y) ≤ 0.02', '', rho, tool.resistance.rho],
      ['v_Rd,c (Eq. 6.47)', 'MPa', vRdc, tool.resistance.vRdc],
      ['u_0 = 2(c_1 + c_2)', 'mm', u0, tool.u0],
      ['u_1 = 2(c_1 + c_2) + 4πd', 'mm', u1, tool.u1],
      ['v_Ed,0 = βV/(u_0·d)', 'MPa', v0, row('max').demand],
      ['v_Rd,max (Eq. 6.53)', 'MPa', vRdMax(fck), tool.vRdMax],
      ['v_Ed,1 = βV/(u_1·d)', 'MPa', v1, tool.loads[0].vEd1],
      ['UR concrete = v_Ed,1/v_Rd,c', '', v1 / vRdc, row('concrete').ur],
    ] });
  }
  {
    // 2 · CSI RC-PN-001 geometry: 300 × 900 column, h 250, d 218, ρ 0.005 each way, V 800 kN, β 1.15, f_yk 500.
    const d = 218, c1 = 300, c2 = 900, V = 800e3, beta = 1.15, fck = 30;
    const { k, rho, vRdc } = concrete({ d, dx: 218, dy: 218, asx: 1090, asy: 1090, fck });
    const u1 = 2 * (c1 + c2) + 4 * Math.PI * d;
    const v1 = beta * V / (u1 * d);
    const sr = 150; // auto arrangement s_r (input, default 150 mm ≤ 0.75d = 163.5)
    const fywdEf = Math.min(250 + 0.25 * d, 500 / 1.15); // Eq. 6.52 note
    const asw = (v1 - 0.75 * vRdc) * u1 * sr / (1.5 * fywdEf); // Eq. 6.52 solved for A_sw
    const uOut = beta * V / (vRdc * d); // Eq. 6.54
    const aOut = (uOut - 2 * (c1 + c2)) / (2 * Math.PI);
    const tool = calculateDesign(exampleById('internal-links').input);
    const row = id => tool.loads[0].rows.find(entry => entry.id === id);
    out.push({ id: 'internal-links', title: 'CSI RC-PN-001 geometry, links required', rows: [
      ['k', '', k, tool.resistance.k],
      ['ρ_l', '', rho, tool.resistance.rho],
      ['v_Rd,c (Eq. 6.47)', 'MPa', vRdc, tool.resistance.vRdc],
      ['u_1 = 2(c_1 + c_2) + 4πd', 'mm', u1, tool.u1],
      ['v_Ed,1 = βV/(u_1·d)', 'MPa', v1, tool.loads[0].vEd1],
      ['k_max·v_Rd,c = 1.5 v_Rd,c', 'MPa', 1.5 * vRdc, row('kmax').resistance],
      ['s_r (auto arrangement input)', 'mm', sr, tool.envelope.sr],
      ['f_ywd,ef = 250 + 0.25d ≤ f_ywd', 'MPa', fywdEf, tool.fywdEf],
      ['A_sw,req per perimeter (Eq. 6.52)', 'mm²', asw, tool.envelope.aswReq],
      ['u_out,ef = βV/(v_Rd,c·d) (Eq. 6.54)', 'mm', uOut, tool.envelope.uOut],
      ['a_out = (u_out − 2(c_1 + c_2))/2π', 'mm', aOut, tool.envelope.aOut],
    ] });
  }
  {
    // 3 · Column head l_H ≤ 2h_H (Fig. 6.17): 400 × 400 column, head 1000 × 1000, h 250, h_tot 450, V 700 kN.
    const d = 210, c = 400, l = 1000, hH = 450 - 250, lH = (l - c) / 2, V = 700e3, beta = 1.15, fck = 30;
    const { vRdc } = concrete({ d, dx: 215, dy: 205, asx: 1340, asy: 1340, fck });
    const r634 = 2 * d + 0.56 * Math.sqrt(l * l), r635 = 2 * d + 0.69 * l; // Eq. 6.34, 6.35 (l1 = l2)
    const rcont = Math.min(r634, r635);
    const u1 = 2 * Math.PI * rcont;
    const v1 = beta * V / (u1 * d);
    const tool = calculateDesign(exampleById('drop-small').input);
    const row = id => tool.loads[0].rows.find(entry => entry.id === id);
    out.push({ id: 'drop-small', title: 'Column head l_H ≤ 2h_H (Fig. 6.17)', rows: [
      ['l_H = (l − c)/2 ≤ 2h_H', 'mm', lH, Math.min(...tool.head.lH)],
      ['2h_H', 'mm', 2 * hH, 2 * tool.head.hH],
      ['r_cont,6.34 = 2d + 0.56√(l_1·l_2)', 'mm', r634, tool.head.rcont.r],
      ['r_cont,6.35 = 2d + 0.69·l_1', 'mm', r635, tool.head.rcont.alt],
      ['u_1 = 2π·r_cont', 'mm', u1, tool.u1],
      ['v_Ed,1 = βV/(u_1·d)', 'MPa', v1, tool.loads[0].vEd1],
      ['v_Rd,c', 'MPa', vRdc, tool.resistance.vRdc],
      ['UR = v_Ed,1/v_Rd,c', '', v1 / vRdc, row('concrete').ur],
    ] });
  }
  for (const example of out) {
    example.rows = example.rows.map(([quantity, unit, hand, tool]) => ({ quantity, unit, hand, tool, diff: hand ? Math.abs(tool - hand) / Math.abs(hand) : Math.abs(tool - hand) }));
    example.maxDiff = Math.max(...example.rows.map(entry => entry.diff));
  }
  return out;
}

export function caseTable() {
  return CASES.map(item => {
    const r = calculateDesign(item.input);
    const i = r.input;
    const column = i.column.shape === 'circular' ? `Ø${i.column.diameter}` : `${i.column.cx}×${i.column.cy}`;
    const head = i.head?.enabled ? (i.head.shape === 'circular' ? `Ø${i.head.diameter}` : `${i.head.lx}×${i.head.ly}`) + `, h_tot ${i.head.thickness}` : '';
    return {
      id: item.id, title: item.title, position: i.column.position, column, h: i.slab.h, head, openings: i.openings?.length ?? 0,
      V: i.loads[0].V, expect: item.expect, status: r.status, ur: round(r.governing?.ur), governing: r.governing?.check ?? '',
      layers: r.layout?.layers?.length ?? 0, links: r.layout?.links?.length ?? 0, match: r.status === item.expect,
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = { cases: caseTable(), examples: handExamples() };
  if (process.argv.includes('--json')) console.log(JSON.stringify(data, null, 1));
  else {
    for (const c of data.cases) console.log(`${c.match ? 'OK ' : 'XX '} ${c.id.padEnd(17)} ${c.status.padEnd(13)} UR ${c.ur}`);
    for (const e of data.examples) console.log(`${e.id}: max |tool − hand|/hand = ${(e.maxDiff * 100).toFixed(4)} %`);
  }
}
