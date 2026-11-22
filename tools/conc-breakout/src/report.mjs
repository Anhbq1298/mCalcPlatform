// Canvas worksheet for a saved design: basis, inputs, drawings, equilibrium and the check table.
// Values are a snapshot of the tool's calculation; reopen the tool to recalculate.
import { createDocument, escape, R } from './report-doc.mjs';
import { planSvg } from './plan-view.mjs';
import { sectionSvg } from './section-view.mjs';

const fmt = (value, digits = 3) => Number(value.toFixed(digits)).toString();
const define = (symbol, value, unit) => symbol + R`\coloneq ` + fmt(value) + (unit ? R`\,\mathrm{` + unit + '}' : '');

export function buildReport(result, { pageHeight, pageGap, designName = 'Embedded plate connection' }) {
  const doc = createDocument({ pageHeight, pageGap, title: 'Embedded Plate Connection Check' });
  const { input, eq, concrete, grade, gammas } = result;
  const { concrete: c, plate, member, actions: a, rebars, studs: s, options: o } = input;
  doc.heading('EMBEDDED PLATE CONNECTION (EN 1992-4 / EN 1992-1-1 / EN 1993-1-8)', 1);
  doc.text(`Design: ${escape(designName)}. Status: <b>${escape(result.status)}</b>.`);
  doc.text('Basis: EN 1992-4:2018 headed fasteners (recommended partial factors, Table 4.1); EN 1992-1-1:2004 anchorage and bearing; EN 1993-1-8:2005 component method and welds. National Annex values are not applied. Rigid-plate force distribution with a linear strain field about the compression centre.', 11);
  doc.heading('1 Actions');
  doc.value('Axial force, tension positive', define('N_{Ed}', a.N, 'kN'));
  doc.value('Shear, downward', define('V_{Ed}', a.V, 'kN'));
  doc.value('Eccentricity of V from plate face', define('e_{V}', a.e, 'mm'));
  doc.value('Moment at plate face, M + V·e', define('M_{Ed,tot}', result.actions.M / 1e6, R`kN\cdot m`));
  doc.heading('2 Materials and geometry');
  doc.value('Concrete ' + (c.cracked ? '(cracked)' : '(uncracked)'), define('f_{ck}', c.fck, 'MPa'));
  doc.value('Design compressive strength', define('f_{cd}', concrete.fcd, 'MPa'));
  doc.value('Joint bearing strength β_j·α·f_cd', define('f_{jd}', result.fjd, 'MPa'));
  doc.value(`Plate ${escape(plate.grade)}, ${plate.B} × ${plate.H}`, define('t_{p}', plate.t, 'mm'));
  doc.value('Plate yield strength', define('f_{y}', grade.fy, 'MPa'));
  doc.value(`Studs ${s.nx} × ${s.ny}, Ø${s.d}, head Ø${s.dh}`, define('h_{ef}', s.hef, 'mm'));
  doc.value('Stud partial factors, tension / shear', R`\gamma_{Ms,N}\coloneq ` + fmt(gammas.MsN) + R`,\;\gamma_{Ms,V}\coloneq ` + fmt(gammas.MsV));
  doc.text('Welded bars: ' + escape(rebars.rows.map((row, i) => `row ${i + 1}: ${row.n}Ø${row.d} at y = ${row.y} mm`).join('; ') || 'none') + `; f_yk = ${rebars.fyk} MPa; ${rebars.shape}; l_b,prov = ${rebars.length} mm.`, 11);
  doc.text(`Steel member footprint ${member.b} × ${member.h} mm, t_f = ${member.tf} mm. Compression model: ${o.method === 'component' ? 'flange T-stub, EN 1993-1-8 §6.2.5' : 'full-width rectangular block'}. Stud tension: ${s.tension === 'shared' ? 'studs share tension' : 'neglected (bars take tension)'}.`, 11);
  doc.image(planSvg(result, { width: 560, height: 480 }), 560, 480);
  doc.image(sectionSvg(result, { width: 560, height: 480 }), 560, 480);
  doc.heading('3 Equilibrium');
  if (eq.unsupported) doc.text('Not solved: ' + escape(eq.unsupported));
  else {
    doc.value('Bearing resultant', define('C_{Ed}', eq.C / 1e3, 'kN'));
    doc.value('Tension resultant', define('T_{Ed}', eq.T / 1e3, 'kN'));
    if (eq.lever) doc.value('Lever arm between T and C', define('z', eq.lever, 'mm'));
    const rows = [['Element', 'y (mm)', 'F (kN)']];
    for (const item of [...result.bars, ...result.studs].filter(item => item.F > 0)) rows.push([item.id, fmt(item.y, 0), fmt(item.F / 1e3, 1)]);
    if (rows.length > 1) doc.table(rows, [200, 200, 200]);
  }
  doc.heading('4 Verification summary');
  doc.table([['Check', 'UR', 'Status', 'Reference'], ...result.rows.map(row => [row.label, row.hideRatio || row.ratio == null ? '' : row.ratio.toFixed(3), row.status, row.ref])], [230, 60, 90, 260]);
  doc.heading('5 Check details');
  for (const row of result.rows) doc.text(`<b>${escape(row.label)}</b> (${escape(row.ref)}): ${escape(row.detail ?? '')}`, 11);
  doc.text('Not covered: blow-out values, supplementary reinforcement for anchors, steel member and member-to-plate weld design, two-way plate bending, and the strut-and-tie model of the receiving member, which the engineer confirms separately.', 11);
  return doc.finish();
}
