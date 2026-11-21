// Canvas worksheet report. Resistances, β, stresses and checks are live Canvas formulas, so the
// worksheet recomputes them independently of the tool. Measured layout geometry (tangential gaps,
// effective leg counts) is entered as values taken from the tool's layout model.
import { createDocument, define, num, R, unit } from './worksheet-doc.mjs';
import { planSvg } from './plan-view.mjs';
import { sectionSvg } from './section-view.mjs';
import { esc } from './svg.mjs';
import { LINK_SHAPES } from './layout.mjs';
import { STATES } from './inputs.mjs';

const deg = θ => R`\frac{\pi\cdot${num(θ)}}{180}`;

export function buildWorksheet(full, { pageHeight, pageGap, designName = 'Punching shear design' }) {
  const result = full.head && full.checkInput ? { ...full, input: full.checkInput } : full; // inputs of the solved section
  const doc = createDocument({ pageHeight, pageGap, title: 'Punching Shear Check' });
  const { input } = result;
  const { column } = input;
  const rect = column.shape === 'rectangular';
  doc.heading('PUNCHING SHEAR CHECK – INTERNAL COLUMN (EC2)', 1);
  doc.text(`Design: ${esc(designName)}. ${esc(result.profile.standard)}. ${esc(result.profile.nationalAnnex)}.`);
  doc.text(`Design status: <b>${esc(result.status)}</b>. Governing: ${esc(result.governing?.load ?? '—')}, ${esc(result.governing?.check ?? '—')}, UR = ${result.governing?.ur?.toFixed(3) ?? '—'}.`);
  for (const issue of result.issues) doc.text(`${esc(issue.state)}: ${esc(issue.message)}`, 12);
  for (const note of result.notes) doc.text(esc(note), 12);
  if (!result.section) return doc.finish();

  doc.heading('1 Geometry and materials');
  if (full.head) headSection(doc, full);
  const kind = result.position?.kind ?? 'internal';
  if (kind !== 'internal') {
    doc.text(`${kind === 'edge' ? 'Edge' : 'Corner'} column with faces flush with the slab edge${kind === 'corner' ? 's' : ''}. c1 is perpendicular to ${kind === 'edge' ? 'the free edge' : 'the first free edge'}, c2 to the other direction (Fig. 6.20).`, 12);
    doc.math('Column dimension c_1', define('c_{1}', num(result.position.c1) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math('Column dimension c_2', define('c_{2}', num(result.position.c2) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  } else if (rect) {
    doc.math('Column dimension c_x', define('c_{x}', num(column.cx) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math('Column dimension c_y', define('c_{y}', num(column.cy) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math('Column rotation (degrees)', define(R`\theta_{c}`, num(column.rotation)), { mode: 'auto' });
  } else {
    doc.math('Column diameter', define('D', num(column.diameter) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math('Column rotation (degrees)', define(R`\theta_{c}`, '0'), { mode: 'auto' });
  }
  doc.math('Slab thickness', define('h', num(input.slab.h) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  doc.math('Effective depth, x bars', define('d_{x}', num(result.section.dx) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  doc.math('Effective depth, y bars', define('d_{y}', num(result.section.dy) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  doc.math('Mean effective depth', define('d', R`\frac{d_{x}+d_{y}}{2}`), { displayUnit: 'mm' });
  doc.math('Top steel per metre, x', define('A_{s.x}', num(result.section.asx) + unit.mm2), { displayUnit: 'mm^2', mode: 'auto', precision: 0 });
  doc.math('Top steel per metre, y', define('A_{s.y}', num(result.section.asy) + unit.mm2), { displayUnit: 'mm^2', mode: 'auto', precision: 0 });
  doc.math('Concrete strength', define('f_{ck}', num(input.materials.fck) + unit.MPa), { displayUnit: 'MPa', mode: 'auto' });
  doc.math('Link yield strength', define('f_{yk}', num(input.materials.fyk) + unit.MPa), { displayUnit: 'MPa', mode: 'auto' });
  doc.math('Partial factors (§2.4.2.4)', define(R`\gamma_{c}`, '1.5'), { mode: 'auto' });
  doc.math('', define(R`\gamma_{s}`, '1.15'), { mode: 'auto' });

  doc.heading('2 Perimeters and resistances');
  doc.text(`Areas per metre width over the strip (1000 mm), ρ limited to 0.02 (Eq. 6.47). ${esc(result.profile.nationalAnnex)}.`, 12);
  doc.math('ρ_x', define(R`\rho_{x}`, R`\min\left(\frac{A_{s.x}}{1000\,\mathrm{mm}\cdot d_{x}},0.02\right)`), { precision: 5 });
  doc.math('ρ_y', define(R`\rho_{y}`, R`\min\left(\frac{A_{s.y}}{1000\,\mathrm{mm}\cdot d_{y}},0.02\right)`), { precision: 5 });
  doc.math('ρ_l', define(R`\rho_{l}`, R`\min\left(\sqrt{\rho_{x}\rho_{y}},0.02\right)`), { precision: 5 });
  doc.math(result.profile.fckShearCap ? 'f_ck for shear (C_max = C50/60, NA 3.1.2(2)P)' : 'f_ck for shear', define('f_{ck.v}', result.profile.fckShearCap ? R`\min\left(f_{ck},${result.profile.fckShearCap}\,\mathrm{MPa}\right)` : 'f_{ck}'), { displayUnit: 'MPa' });
  doc.math('Size factor k', define('k', R`\min\left(1+\sqrt{\frac{200\,\mathrm{mm}}{d}},2\right)`));
  doc.math('v_min (Eq. 6.3N)', define(R`v_{min}`, R`0.035k^{1.5}\sqrt{\frac{f_{ck.v}}{\mathrm{MPa}}}` + unit.MPa), { displayUnit: 'MPa' });
  doc.math('σ_cp = (σ_cx + σ_cy)/2', define(R`\sigma_{cp}`, num(result.resistance.sigmaCp) + unit.MPa), { displayUnit: 'MPa', mode: 'auto' });
  doc.math('v_Rd,c (Eq. 6.47)', define(R`v_{Rd.c}`, R`\max\left(\frac{0.18}{\gamma_{c}}k\left(100\rho_{l}\frac{f_{ck.v}}{\mathrm{MPa}}\right)^{\frac{1}{3}}\,\mathrm{MPa}+0.1\sigma_{cp},v_{min}+0.1\sigma_{cp}\right)`), { displayUnit: 'MPa' });
  doc.math('ν (Eq. 6.6N)', define(R`\nu`, R`0.6\left(1-\frac{f_{ck.v}}{250\,\mathrm{MPa}}\right)`));
  doc.math('v_Rd,max (§6.4.5(3))', define(R`v_{Rd.max}`, num(result.profile.vRdMaxFactor) + R`\nu\frac{f_{ck.v}}{\gamma_{c}}`), { displayUnit: 'MPa' });
  perimeters(doc, result, kind, rect);
  doc.math('f_ywd,ef (§6.4.5(1))', define(R`f_{ywd.ef}`, R`\min\left(250\,\mathrm{MPa}+0.25\frac{d}{\mathrm{mm}}\,\mathrm{MPa},\frac{f_{yk}}{\gamma_{s}}\right)`), { displayUnit: 'MPa', precision: 1 });
  doc.math(esc(result.profile.kMaxLabel), define(R`k_{max}`, num(result.profile.kMax)), { mode: 'auto' });

  const layout = result.layout;
  const layers = layout.summary;
  if (layers.length) layoutSection(doc, layers);
  result.loads.forEach((load, index) => combination(doc, result, load, index + 1, rect, layers.length > 1));
  if (layers.length) detailing(doc, result, layers);

  doc.heading('Drawings', 2);
  doc.image(planSvg(full, { width: 640, height: 600 }), 640, 600);
  for (const axis of ['x', 'y']) {
    const section = sectionSvg(full, { width: 640, axis });
    doc.image(section, 640, Number(/height="(\d+(?:\.\d+)?)"/.exec(section)?.[1] ?? 330));
  }
  if (layers.length) {
    doc.heading('Link layer schedule', 3);
    doc.table([
      ['Layer', 'Offset', 'Ø', 'Shape', 'Links', 'Eff. legs', 'A_sw', 'Reinf.', 'Detailing'],
      ...layers.map(layer => [layer.id, layer.offset.toFixed(0), layer.diameter, LINK_SHAPES[layer.shape].label, layer.physicalLinks, `${layer.effectiveLegs}/${layer.legs}`, layer.asw.toFixed(0), layer.reinforcementState, layer.detailingState]),
    ], [48, 56, 36, 120, 48, 64, 56, 84, 128]);
  }
  doc.heading('Basis, assumptions and limitations', 2);
  for (const parameter of result.profile.parameters) doc.text(`${esc(parameter.name)} = ${esc(String(typeof parameter.value === 'number' ? Number(parameter.value.toFixed(4)) : parameter.value))} · ${esc(parameter.source)} · ${esc(parameter.status)}`, 12);
  for (const text of result.profile.assumptions) doc.text('Assumption: ' + esc(text), 12);
  for (const text of result.profile.unsupported) doc.text('Not supported: ' + esc(text), 12);
  doc.text('Validation status: formulas unit-tested and benchmarked against CSI SAFE RC-PN-001 and Dlubal VE 1023 intermediate values; see tools/punching-shear/SOURCES.md. Anchorage is not checked.', 12);
  return doc.finish();
}

// Eq. 6.44 (edge) or Eq. 6.46 (corner) with the eccentricity resolved against the free edges.
function edgeBeta(doc, result, load, i, kind) {
  const [n1] = result.position.normals;
  doc.math('Eccentricity e_x = M_y/V', define(`e_{x.${i}}`, R`\frac{M_{y.${i}}}{V_{Ed.${i}}}`), { displayUnit: 'mm', precision: 1 });
  doc.math('Eccentricity e_y = M_x/V', define(`e_{y.${i}}`, R`\frac{M_{x.${i}}}{V_{Ed.${i}}}`), { displayUnit: 'mm', precision: 1 });
  if (kind === 'corner') return R`\frac{u_{1}}{u_{1s}}`;
  doc.math('Eccentricity toward the interior', define(`e_{n.${i}}`, `${num(n1.x)}e_{x.${i}}+${num(n1.y)}e_{y.${i}}`), { displayUnit: 'mm', precision: 1 });
  doc.math('Eccentricity parallel to the edge', define(`e_{par.${i}}`, R`\left|${num(-n1.y)}e_{x.${i}}+${num(n1.x)}e_{y.${i}}\right|`), { displayUnit: 'mm', precision: 1 });
  if (!load.beta.terms?.W1) return R`\frac{u_{1}}{u_{1s}}`;
  doc.math('k from Table 6.1 with c_1/2c_2', define(`k_{\\beta.${i}}`, num(load.beta.terms.k)), { mode: 'auto' });
  doc.math('W_1 (Eq. 6.45)', define(`W_{1.${i}}`, R`\frac{c_{2}^2}{4}+c_{1}c_{2}+4c_{1}d+8d^2+\pi dc_{2}`), { displayUnit: 'mm^2', precision: 0 });
  return R`\frac{u_{1}}{u_{1s}}+k_{\beta.${i}}\frac{e_{par.${i}}u_{1}}{W_{1.${i}}}`;
}

function perimeters(doc, result, kind, rect) {
  if (result.head) {
    doc.text('Perimeters of the drop section are measured on the exact geometry by the tool (§6.4.2(8)–(11)).', 12);
    doc.math('Loaded perimeter u_0', define('u_{0}', num(result.u0, 3) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 1 });
    doc.math('Control perimeter u_1', define('u_{1}', num(result.u1, 3) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 1 });
  } else if (result.shadows?.length) {
    doc.text('Openings within 6d: the sectors between the tangents are ineffective (§6.4.2(3)). Effective lengths are measured on the exact perimeter geometry by the tool.', 12);
    doc.math('Loaded perimeter u_0 (effective)', define('u_{0}', num(result.u0, 3) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 1 });
    doc.math('Basic control perimeter u_1 (effective)', define('u_{1}', num(result.u1, 3) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 1 });
  } else if (kind === 'edge') {
    doc.math('u_0 (§6.4.5(3))', define('u_{0}', R`\min\left(c_{2}+3d,c_{2}+2c_{1}\right)`), { displayUnit: 'mm', precision: 1 });
    doc.math('u_1 (Fig. 6.15)', define('u_{1}', R`2c_{1}+c_{2}+2\pi d`), { displayUnit: 'mm', precision: 1 });
  } else if (kind === 'corner') {
    doc.math('u_0 (§6.4.5(3))', define('u_{0}', R`\min\left(3d,c_{1}+c_{2}\right)`), { displayUnit: 'mm', precision: 1 });
    doc.math('u_1 (Fig. 6.15)', define('u_{1}', R`c_{1}+c_{2}+\pi d`), { displayUnit: 'mm', precision: 1 });
  } else {
    doc.math('Loaded perimeter u_0', define('u_{0}', rect ? R`2\left(c_{x}+c_{y}\right)` : R`\pi D`), { displayUnit: 'mm', precision: 1 });
    doc.math('Basic control perimeter u_1 at 2d', define('u_{1}', rect ? R`2\left(c_{x}+c_{y}\right)+4\pi d` : R`\pi\left(D+4d\right)`), { displayUnit: 'mm', precision: 1 });
  }
  if (kind === 'edge') doc.math('u_1* (Fig. 6.20 a)', define('u_{1s}', R`2\min\left(1.5d,0.5c_{1}\right)+c_{2}+2\pi d`), { displayUnit: 'mm', precision: 1 });
  if (kind === 'corner') doc.math('u_1* (Fig. 6.20 b)', define('u_{1s}', R`\min\left(1.5d,0.5c_{1}\right)+\min\left(1.5d,0.5c_{2}\right)+\pi d`), { displayUnit: 'mm', precision: 1 });
}

function outerOffset(result, i, rect) {
  const kind = result.position?.kind ?? 'internal';
  if (result.shadows?.length || result.head) return num(result.loads[i - 1].aOut, 3) + unit.mm;
  if (kind === 'edge') return R`\frac{u_{out.${i}}-2c_{1}-c_{2}}{\pi}`;
  if (kind === 'corner') return R`\frac{2\left(u_{out.${i}}-c_{1}-c_{2}\right)}{\pi}`;
  return rect ? R`\frac{u_{out.${i}}-2\left(c_{x}+c_{y}\right)}{2\pi}` : R`\frac{\frac{u_{out.${i}}}{\pi}-D}{2}`;
}

function layoutSection(doc, layers) {
  doc.heading('3 Punching reinforcement layout');
  doc.text('Effective legs are inside the slab and outside openings. A_sw per layer = effective legs × leg area.', 12);
  layers.forEach((layer, i) => {
    const j = i + 1;
    doc.math(`${layer.id} offset from column face`, define(`a_{L${j}}`, num(layer.offset) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 0 });
    doc.math(`${layer.id} effective legs, Ø`, define(`n_{L${j}}`, String(layer.effectiveLegs)), { mode: 'auto' });
    doc.math('', define(R`\phi_{L${j}}`, num(layer.diameter) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math(`${layer.id} A_sw`, define(`A_{sw.L${j}}`, R`n_{L${j}}\cdot0.25\pi\phi_{L${j}}^2`), { displayUnit: 'mm^2', precision: 0 });
  });
  doc.math('Smallest layer A_sw', define('A_{sw}', R`\min\left(${layers.map((_, i) => `A_{sw.L${i + 1}}`).join(',')}\right)`), { displayUnit: 'mm^2', precision: 0 });
  if (layers.length > 1) {
    const gaps = layers.slice(1).map((_, i) => `a_{L${i + 2}}-a_{L${i + 1}}`);
    doc.math('Largest radial spacing', define('s_{r}', gaps.length > 1 ? R`\max\left(${gaps.join(',')}\right)` : gaps[0]), { displayUnit: 'mm', precision: 0 });
  }
}

function combination(doc, result, load, i, rect, hasSr) {
  doc.heading(`${4 + i - 1} Combination ${esc(load.name)}`);
  doc.math('Punching force', define(`V_{Ed.${i}}`, num(load.V) + unit.kN), { displayUnit: 'kN', mode: 'auto' });
  doc.math('Moment about x', define(`M_{x.${i}}`, num(load.Mx) + unit.kNm), { displayUnit: 'kN m', mode: 'auto' });
  doc.math('Moment about y', define(`M_{y.${i}}`, num(load.My) + unit.kNm), { displayUnit: 'kN m', mode: 'auto' });
  const method = result.input.beta.method;
  const terms = load.beta.terms;
  const kind = result.position?.kind ?? 'internal';
  doc.text(`β: ${esc(load.beta.method)}.`, 12);
  if (!Number.isFinite(load.beta.value)) {
    doc.text(`${esc(load.beta.state)}: ${esc(load.beta.message)}`, 12);
    return;
  }
  let beta;
  if (method !== 'moment') beta = num(load.beta.value);
  else if (kind !== 'internal') beta = edgeBeta(doc, result, load, i, kind);
  else {
    if (terms && (terms.e1 || terms.e2)) {
      doc.math('Eccentricity along local x', define(`e_{1.${i}}`, R`\frac{M_{y.${i}}\cos\left(${deg(result.input.column.rotation)}\right)+M_{x.${i}}\sin\left(${deg(result.input.column.rotation)}\right)}{V_{Ed.${i}}}`), { displayUnit: 'mm', precision: 1 });
      doc.math('Eccentricity along local y', define(`e_{2.${i}}`, R`\frac{M_{x.${i}}\cos\left(${deg(result.input.column.rotation)}\right)-M_{y.${i}}\sin\left(${deg(result.input.column.rotation)}\right)}{V_{Ed.${i}}}`), { displayUnit: 'mm', precision: 1 });
    }
    if (!terms || (!terms.e1 && !terms.e2) || load.beta.value === 1) beta = '1';
    else if (!rect) beta = R`1+0.6\pi\frac{\sqrt{e_{1.${i}}^2+e_{2.${i}}^2}}{D+4d}`;
    else if (terms.W1) {
      const [c1, c2, e] = Math.abs(terms.e2) < 1e-9 ? ['c_{x}', 'c_{y}', `e_{1.${i}}`] : ['c_{y}', 'c_{x}', `e_{2.${i}}`];
      doc.math('k from Table 6.1', define(`k_{\\beta.${i}}`, num(terms.k)), { mode: 'auto' });
      doc.math('W_1 (Eq. 6.41)', define(`W_{1.${i}}`, R`\frac{${c1}^2}{2}+${c1}${c2}+4${c2}d+16d^2+2\pi d${c1}`), { displayUnit: 'mm^2', precision: 0 });
      beta = R`1+k_{\beta.${i}}\frac{\left|${e}\right|u_{1}}{W_{1.${i}}}`;
    } else {
      beta = R`1+1.8\max\left(\sqrt{\left(\frac{e_{1.${i}}}{c_{x}+4d}\right)^2+\left(\frac{e_{2.${i}}}{c_{y}+4d}\right)^2},\sqrt{\left(\frac{e_{1.${i}}}{c_{y}+4d}\right)^2+\left(\frac{e_{2.${i}}}{c_{x}+4d}\right)^2}\right)`;
    }
  }
  doc.math('Load increment factor β', define(R`\beta_{${i}}`, beta));
  doc.math('Stress at u_0 (Eq. 6.53)', define(`v_{Ed0.${i}}`, R`\frac{\beta_{${i}}V_{Ed.${i}}}{u_{0}d}`), { displayUnit: 'MPa' });
  doc.math('', R`v_{Ed0.${i}}\le v_{Rd.max}`, { displayUnit: 'MPa', mode: 'auto' });
  doc.math('Stress at u_1 (Eq. 6.38)', define(`v_{Ed1.${i}}`, R`\frac{\beta_{${i}}V_{Ed.${i}}}{u_{1}d}`), { displayUnit: 'MPa' });
  if (!load.required) {
    doc.math('No links required', R`v_{Ed1.${i}}\le v_{Rd.c}`, { displayUnit: 'MPa', mode: 'auto' });
    return;
  }
  doc.text('v_Ed > v_Rd,c: punching reinforcement required (§6.4.5).', 12);
  doc.math('Upper limit with links', R`v_{Ed1.${i}}\le k_{max}v_{Rd.c}`, { displayUnit: 'MPa', mode: 'auto' });
  doc.math('u_out,ef (Eq. 6.54)', define(`u_{out.${i}}`, R`\frac{\beta_{${i}}V_{Ed.${i}}}{v_{Rd.c}d}`), { displayUnit: 'mm', precision: 0 });
  doc.math(result.shadows?.length ? 'Offset of u_out,ef (measured by the tool)' : 'Offset of u_out,ef from the face', define(`a_{out.${i}}`, outerOffset(result, i, rect)), { displayUnit: 'mm', precision: 0 });
  if (hasSr) {
    doc.math('v_Rd,cs (Eq. 6.52)', define(`v_{Rd.cs.${i}}`, R`0.75v_{Rd.c}+1.5\frac{d}{s_{r}}\frac{A_{sw}f_{ywd.ef}}{u_{1}d}`), { displayUnit: 'MPa' });
    doc.math('', R`v_{Ed1.${i}}\le v_{Rd.cs.${i}}`, { displayUnit: 'MPa', mode: 'auto' });
    const last = result.layout.summary.length;
    doc.math('Outer coverage (§6.4.5(4))', R`a_{L${last}}\ge a_{out.${i}}-1.5d`, { displayUnit: 'mm', mode: 'auto' });
  }
}

function detailing(doc, result, layers) {
  doc.heading(`${4 + result.loads.length} Detailing (§9.4.3)`);
  doc.math('First layer', R`a_{L1}\le0.5d`, { displayUnit: 'mm', mode: 'auto' });
  if (layers.length > 1) doc.math('Radial spacing', R`s_{r}\le0.75d`, { displayUnit: 'mm', mode: 'auto' });
  doc.text(`Tangential spacing is measured along each layer between consecutive effective legs: ≤ 1.5d inside u1, ≤ 2d outside. Minimum leg area from Eq. 9.11 with α = 90°.`, 12);
  const check = result.loads.find(load => load.layoutCheck)?.layoutCheck;
  layers.forEach((layer, i) => {
    const j = i + 1;
    const entry = check?.layerRows[i];
    doc.math(`${layer.id} largest tangential gap`, define(`s_{t.L${j}}`, num(layer.tangential.max, 1) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 0 });
    doc.math('', R`s_{t.L${j}}\le${layer.offset <= 2 * result.section.d ? '1.5' : '2'}d`, { displayUnit: 'mm', mode: 'auto' });
    if (entry) {
      doc.math(`${layer.id} radial spacing used in Eq. 9.11`, define(`s_{r.L${j}}`, num(entry.sr, 1) + unit.mm), { displayUnit: 'mm', mode: 'auto', precision: 0 });
      doc.math('', R`0.25\pi\phi_{L${j}}^2\ge\frac{0.08\sqrt{\frac{f_{ck}}{\mathrm{MPa}}}}{\frac{f_{yk}}{\mathrm{MPa}}}\cdot\frac{s_{r.L${j}}s_{t.L${j}}}{1.5}`, { displayUnit: 'mm^2', mode: 'auto' });
    }
  });
  const anchorage = result.input.reinforcement.anchorage;
  doc.text('Slab depth (§9.3.2(1)), mandrel diameter (§8.3, Table 8.1N), link anchorage (§8.5, Fig. 8.5) and fit of both bends within h − 2c.', 12);
  doc.math('Slab depth with shear reinforcement', R`h\ge200\,\mathrm{mm}`, { displayUnit: 'mm', mode: 'auto' });
  doc.math('Cover', define('c', num(result.input.slab.cover) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  doc.math('Straight extension after the bend', define('l_{ext}', num(anchorage.extension) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
  const hook = anchorage.type !== 'bend';
  for (const phi of [...new Set(layers.map(layer => layer.diameter))].sort((a, b) => a - b)) {
    const m = `\\phi_{m.${phi}}`;
    doc.math(`Ø${phi} mandrel diameter`, define(m, num(anchorage.mandrelFactor * phi) + unit.mm), { displayUnit: 'mm', mode: 'auto' });
    doc.math('', `${m}\\ge${phi <= 16 ? 4 : 7}\\cdot${phi}` + unit.mm, { displayUnit: 'mm', mode: 'auto' });
    doc.math('', R`l_{ext}\ge\max\left(${hook ? 5 : 10}\cdot${phi}\,\mathrm{mm},${hook ? 50 : 70}\,\mathrm{mm}\right)`, { displayUnit: 'mm', mode: 'auto' });
    doc.math('', R`h-2c\ge${m}+2\cdot${phi}\,\mathrm{mm}`, { displayUnit: 'mm', mode: 'auto' });
  }
  doc.text(anchorage.engaged ? 'Links enclose the top and bottom flexural bars: confirmed by the designer.' : `Links enclosing the top and bottom flexural bars: ${STATES.confirm}.`, 12);
}

// Drop panel / column head: case, section depths and the slab check outside the drop (tool values).
function headSection(doc, full) {
  const head = full.head;
  const lH = head.lH.map(value => value.toFixed(0)).join(' / ');
  doc.text(`Drop panel ${full.input.head.shape === 'circular' ? 'Ø' + full.input.head.diameter : full.input.head.lx + ' × ' + full.input.head.ly} mm, h_H = ${head.hH} mm below the slab, l_H = ${lH} mm.`, 12);
  if (head.kind === 'small') {
    doc.text(`l_H ≤ 2h_H (Fig. 6.17): only the section in the slab is checked (§6.4.2(8)), at r_cont = ${head.rcont.r.toFixed(1)} mm from the column centroid (${head.rcont.eq}${head.rcont.l1 ? `, l1 = ${head.rcont.l1}, l2 = ${head.rcont.l2}` : ''}). It is solved as a circular loaded area of diameter 2(r_cont − 2d); the face check uses the column perimeter with the slab d.`, 12);
    return;
  }
  const extSection = head.sections.find(item => item.id === 'ext');
  if (!head.inner) {
    doc.text(`l_H > 2h_H (Fig. 6.18) but 2d_H = ${(2 * head.dH).toFixed(0)} mm does not fit inside the drop (l_H = ${head.lMin.toFixed(0)} mm): only the slab section at 2d from the drop edge is checked, with d = ${head.d.toFixed(1)} mm. The face check uses the column perimeter with d_H = ${head.dH.toFixed(1)} mm (§6.4.2(10)). The calculation below is the slab section.`, 12);
    if (!head.circular) doc.text('Basis: Eq. 6.36 is stated for circular columns (§6.4.2(11)); for this rectangular drop the control perimeter is constructed at 2d from the drop outline (software interpretation, see Help).', 12);
    return;
  }
  doc.text(`l_H > 2h_H (Fig. 6.18): sections inside the drop with d_H = d + h_H = ${head.dH.toFixed(1)} mm at 2d_H from the column face, and in the slab with d = ${head.d.toFixed(1)} mm at 2d from the drop edge (§6.4.2(9)–(11)). The calculation below is the section inside the drop.`, 12);
  if (!head.circular) doc.text('Basis: Eq. 6.36/6.37 are stated for circular columns (§6.4.2(11)); for this rectangular drop both control perimeters are constructed geometrically (software interpretation, see Help).', 12);
  full.loads.forEach(load => {
    const ext = load.rows.filter(entry => entry.id.startsWith('ext-'));
    for (const entry of ext) doc.text(`${esc(load.name)} · ${esc(entry.label)}: ${entry.demand?.toFixed?.(3) ?? '—'} ≤ ${entry.resistance?.toFixed?.(3) ?? '—'} MPa · ${esc(entry.status)} (tool value, u1,ext = ${extSection.u1.toFixed(0)} mm).`, 12);
  });
}
