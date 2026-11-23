// Canvas worksheet for a saved design: basis, inputs, drawings, equilibrium and the check table.
// Values are a snapshot of the tool's calculation; reopen the tool to recalculate.
import { createDocument, escape, R } from './report-doc.mjs';
import { LOAD_KEYS } from './loads.mjs';
import { spatialSection } from './spatial-drawings.mjs';
import { planSvg } from './plan-view.mjs';
import { sectionSvg } from './section-view.mjs';
import { buildScene, renderScene } from './view3d.mjs';

const fmt = (value, digits = 3) => Number(value.toFixed(digits)).toString();
const define = (symbol, value, unit) => symbol + R`\coloneq ` + fmt(value) + (unit ? R`\,\mathrm{` + unit + '}' : '');

export function buildReport(result, { pageHeight, pageGap, designName = 'Embedded plate connection' }) {
  const doc = createDocument({ pageHeight, pageGap, title: 'Embedded Plate Connection Check' });
  const { input, eq, concrete, grade, gammas } = result;
  const { concrete: c, plate, member, actions: a, rebars, studs: s, options: o } = input;
  doc.heading('EMBEDDED PLATE CONNECTION (EN 1992-4 / EN 1992-1-1 / EN 1993-1-8)', 1);
  doc.text(`Design: ${escape(designName)}. Status: <b>${escape(result.status)}</b>.`);
  doc.text('Basis: EN 1992-4:2018 headed fasteners (recommended partial factors, Table 4.1); EN 1992-1-1:2004 anchorage and bearing; EN 1993-1-8:2005 component method and welds. National Annex values are not applied. ' + (result.eq.fem ? 'Force distribution from a flexible-plate FE model (plate on springs).' : 'Rigid-plate force distribution with a linear strain field about the compression centre.') + '', 11);
  doc.heading('1 Actions');
  if (result.loadingResult) {
    const { point, applied, atOrigin } = result.loadingResult;
    doc.text(`P = (${point.x}, ${point.y}, ${point.z}) mm. O is the plate centre at the concrete interface. +Z outward. Moments use the right-hand rule.`);
    doc.table([['Action', 'At P', 'At O'], ...LOAD_KEYS.map((key, i) => [
      key + (i < 3 ? ' (kN)' : ' (kN·m)'), fmt(applied[key]), fmt(atOrigin[key]),
    ])], [220, 200, 200]);
    doc.text('Generalized loads are transported by M_O = M_P + r × F. Spatial forces use independently supplied stud shear stiffness, elastic point springs and compression-only concrete contact.');
  } else {
    doc.value('Axial force, tension positive', define('N_{Ed}', a.N, 'kN'));
    doc.value('Shear, downward', define('V_{Ed}', a.V, 'kN'));
    doc.value('Eccentricity of V from plate face', define('e_{V}', a.e, 'mm'));
    doc.value('Moment at plate face, M + V·e', define('M_{Ed,tot}', result.actions.M / 1e6, R`kN\cdot m`));
  }
  doc.heading('2 Materials and geometry');
  doc.value('Concrete ' + (c.cracked ? '(cracked)' : '(uncracked)'), define('f_{ck}', c.fck, 'MPa'));
  doc.value('Design compressive strength', define('f_{cd}', concrete.fcd, 'MPa'));
  doc.value('Joint bearing strength β_j·α·f_cd', define('f_{jd}', result.fjd, 'MPa'));
  doc.value(`Plate ${escape(plate.grade)}, ${plate.B} × ${plate.H}`, define('t_{p}', plate.t, 'mm'));
  doc.value('Plate yield strength', define('f_{y}', grade.fy, 'MPa'));
  doc.value(`Studs ${s.nx} × ${s.ny}, Ø${s.d}, head Ø${s.dh}`, define('h_{ef}', s.hef, 'mm'));
  doc.value('Stud partial factors, tension / shear', R`\gamma_{Ms,N}\coloneq ` + fmt(gammas.MsN) + R`,\;\gamma_{Ms,V}\coloneq ` + fmt(gammas.MsV));
  doc.text('Welded bars: ' + escape(result.layout.rows.map((row, i) => `row ${i + 1}: ${row.n}Ø${row.d} at y = ${row.y} mm`).join('; ') || 'none') + `; f_yk = ${rebars.fyk} MPa; ${rebars.shape}; l_b,prov = ${rebars.length} mm.`, 11);
  if (result.loadingResult) {
    doc.text(`Steel member footprint ${member.b} × ${member.h} mm, flange thickness ${member.tf} mm. Stud d = ${s.d} mm, h_ef = ${s.hef} mm. Stud data reference ${escape(s.productReference || 'pending')}.`, 11);
  } else doc.text(`Steel member footprint ${member.b} × ${member.h} mm, t_f = ${member.tf} mm. Compression model: ${o.method === 'component' ? 'flange T-stub, EN 1993-1-8 §6.2.5' : 'full-width rectangular block'}. Stud tension: ${s.tension === 'shared' ? 'studs share tension' : 'neglected (bars take tension)'}.`, 11);
  doc.image(planSvg(result, { width: 560, height: 480 }), 560, 480);
  if (result.loadingResult) {
    for (const axis of ['Y', 'X']) doc.image(spatialSection(result, axis), 560, 480);
  } else doc.image(sectionSvg(result, { width: 560, height: 480 }), 560, 480);
  doc.image(renderScene(buildScene(result, { field: 'stress', scale: 0 }), { width: 560, height: 460, title: '3D VIEW · plate σ_vM' }), 560, 460);
  doc.heading('3 Equilibrium');
  if (eq.fem) {
    const f = eq.fem;
    doc.text(`Flexible-plate analysis: MITC4 plate elements (${f.mesh.elements.length} elements, ${f.mesh.nodes.length} nodes, mesh ≤ ${f.h.toFixed(1)} mm) on compression-only concrete springs k_c = ${f.kc.toFixed(3)} N/mm³ (E_cm = ${(f.Ecm / 1000).toFixed(1)} GPa), tension-only bar and stud springs, steel member as a rigid footprint. Contact ${f.converged ? 'converged' : 'did not converge'} after ${f.iterations} iterations.`, 11);
    if (result.rigid) doc.text(`Rigid-plate comparison: ΣT = ${fmt(result.rigid.T / 1e3, 1)} kN.`, 11);
    doc.value('Peak contact pressure', define('p_{max}', f.pMax, 'MPa'));
    doc.value(f.combinedVmMax !== undefined ? 'Peak combined elastic plate stress' : 'Peak elastic plate bending stress',
      define(R`\sigma_{vM,max}`, f.combinedVmMax ?? f.vmMax, 'MPa'));
  }
  if (result.loadingResult) {
    const equilibrium = Object.entries(eq.residual).map(([key, value]) => [key, value.toExponential(3), key.startsWith('F') ? 'N' : 'N·mm']);
    doc.text(eq.analysisValid ? 'Equilibrium residuals in all six generalized components.' : 'Equilibrium incomplete. Treat the results below as provisional.');
    doc.table([['Residual', 'Value', 'Unit'], ...equilibrium], [160, 220, 180]);
    const anchors = [...result.bars, ...result.studs];
    doc.table([['Anchor', 'X mm', 'Y mm', 'T kN', 'Vx kN', 'Vy kN'], ...anchors.map(anchor => [
      anchor.id, fmt(anchor.x), fmt(anchor.y), fmt(anchor.F / 1e3),
      eq.shearIssue && result.studs.includes(anchor) ? '—' : fmt(anchor.Vx / 1e3),
      eq.shearIssue && result.studs.includes(anchor) ? '—' : fmt(anchor.Vy / 1e3),
    ])], [110, 100, 100, 100, 100, 110]);
    doc.text('Benchmark basis: analytical membrane patch and spring-group solutions, published INFASO cone resistance components, and pre-existing MITC4 plate benchmarks. Full comparison against a published flexible embedded-plate connection remains open. See the mConcBreakout benchmark record.');
  } else if (eq.unsupported) doc.text('Not solved: ' + escape(eq.unsupported));
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
  if (!result.loadingResult) doc.text('Not covered: blow-out values, supplementary reinforcement for anchors, steel member and member-to-plate weld design, two-way plate bending, and the strut-and-tie model of the receiving member, which the engineer confirms separately.', 11);
  return doc.finish();
}
