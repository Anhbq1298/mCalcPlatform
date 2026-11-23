// Assembles the connection checks. Inputs in kN, kN·m, mm, MPa; internal N, mm.
import { coneResistance, concreteInteraction, edgeResistance, pulloutResistance, shankArea, steelInteraction, steelShear, studRows, edgeDistances } from './anchors.mjs';
import { flangeBearing, solveBlock, solveComponent } from './equilibrium.mjs';
import { solveFlexible } from './fem/connection-model.mjs';
import { validateInputs } from './inputs.mjs';
import { resolveLayout, validateLayout } from './layout.mjs';
import { concreteProps, GAMMA, jointStrength, plateProps, studFactors } from './materials.mjs';
import { calculateSpatial } from './spatial-calculate.mjs';
import { rowBending } from './plate.mjs';
import { barArea, barChecks, minMandrel } from './rebar.mjs';

const kN = value => (value / 1e3).toFixed(1) + ' kN';
const mm = value => value.toFixed(0) + ' mm';
const ur = (group, label, ratio, detail, ref) => ({ group, label, ratio, detail, ref, isUR: true, status: ratio <= 1 + 1e-9 ? 'pass' : 'fail' });
const info = (group, label, status, detail, ref) => ({ group, label, ratio: null, detail, ref, status, hideRatio: true });
const worst = (items, key) => items.reduce((a, b) => (key(b) > key(a) ? b : a), items[0]);
const pct = value => (value >= 0 ? '+' : '') + (100 * value).toFixed(0) + '%';
// Deviation of FEM tension forces from the rigid plate: highest element, sum, and departure from a
// linear (plane) distribution fitted to the FEM forces.
function rigidDeviation(fem, rigid) {
  const loaded = fem.filter(e => e.F > 0);
  const maxRigid = Math.max(0, ...rigid.map(e => e.F));
  if (loaded.length === 0 || !(maxRigid > 0)) return null;
  const maxFem = Math.max(...loaded.map(e => e.F));
  const sum = loaded.reduce((s, e) => s + e.F, 0) / rigid.reduce((s, e) => s + e.F, 0) - 1;
  // Least-squares plane F = a + b·y + c·x (normal equations, small 3 × 3 system).
  const rowsA = loaded.map(e => [1, e.y, e.x]);
  const AtA = [0, 1, 2].map(i => [0, 1, 2].map(j => rowsA.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? 1e-9 : 0)));
  const Atb = [0, 1, 2].map(i => rowsA.reduce((s, r, k) => s + r[i] * loaded[k].F, 0));
  const coef = solve3(AtA, Atb);
  const linearity = Math.max(...loaded.map((e, k) => Math.abs(e.F - rowsA[k].reduce((s, v, i) => s + v * coef[i], 0)))) / maxFem;
  return { max: maxFem / maxRigid - 1, sum, linearity };
}
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c && M[c][c]) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => (row[i] ? row[3] / row[i] : 0));
}
const femUplift = (f, point) => f.w[f.mesh.nodes.reduce((a, b) => (Math.hypot(b.x - point.x, b.y - point.y) < Math.hypot(a.x - point.x, a.y - point.y) ? b : a)).id];

export function calculate(raw) {
  const input = validateInputs(raw);
  validateLayout(input);
  if (input.loading?.model === 'spatial') return calculateSpatial(input);
  const { concrete: c, plate, member, actions: a, rebars, studs: s, options: o } = input;
  const concrete = concreteProps(c.fck, c.alphaCc);
  const grade = plateProps(plate.grade);
  const fjd = jointStrength(concrete, o.betaJ, o.alpha);
  const gammas = studFactors(s.fuk, s.fyk);
  const N = a.N * 1e3;
  const V = a.V * 1e3;
  const M = (a.M + a.V * a.e / 1e3) * 1e6;
  const layout = resolveLayout(input);
  const studs = layout.studs.map(p => ({ ...p, kind: 'stud', area: shankArea(s.d) }));
  const bars = layout.bars.map(b => ({ ...b, kind: 'rebar', area: barArea(b.d) }));
  const shared = s.tension === 'shared';
  const elements = shared ? [...bars, ...studs] : bars;
  const rigid = o.method === 'component' ? solveComponent(input, elements, grade.fy, fjd, N, M) : solveBlock(input, elements, fjd, N, M);
  const fem = o.analysis === 'fem';
  const eq = fem ? { ...solveFlexible(input, elements, concrete, N, M), bearing: flangeBearing(input, grade.fy, fjd, -1), bearingTop: flangeBearing(input, grade.fy, fjd, 1) } : rigid;
  const force = new Map(eq.tensions.map(e => [e.id, e.F]));
  // Stud springs (steel shank only) are an upper bound on stud stiffness, so the FEM run with studs
  // under-loads the bars. Bound both: bars also from a run without stud tension; take the larger.
  const barsOnly = fem && shared && bars.length ? solveFlexible(input, bars, concrete, N, M) : null;
  if (barsOnly) for (const bar of barsOnly.tensions) force.set(bar.id, Math.max(force.get(bar.id) ?? 0, bar.F));
  const barResults = bars.map(bar => barChecks({ ...bar, F: force.get(bar.id) ?? 0 }, { rebars, plate, plateGrade: grade, concrete }));
  const studLoads = studs.map(stud => ({ ...stud, F: shared ? force.get(stud.id) ?? 0 : 0 }));
  const rows = [];

  // Equilibrium and bearing
  const forcesText = eq.allCompression ? 'All compression: C = ' + kN(eq.C) + ', no tension elements needed'
    : 'T = ' + kN(eq.T) + (eq.yT !== null ? ' at y = ' + mm(eq.yT) : '') + ' · C = ' + kN(eq.C)
      + (eq.yC !== null ? ' at y = ' + mm(eq.yC) + ' · z = ' + mm(eq.lever ?? 0) : '');
  if (fem) {
    const f = eq.fem;
    rows.push(info('Load path', 'Equilibrium (flexible plate, FEM)', f.converged ? 'pass' : 'incomplete', forcesText + ' · ' + f.mesh.nodes.length + ' nodes, '
      + f.iterations + ' contact iterations · residual ' + Math.abs(eq.residual.Fz).toExponential(1) + ' N' + (f.converged ? '' : ' · contact did not converge'),
      'MITC4 plate on springs; see help §2b'));
  } else {
    rows.push(eq.unsupported ? info('Load path', 'Equilibrium (rigid plate)', 'incomplete', eq.unsupported, 'Statics')
      : info('Load path', 'Equilibrium (rigid plate)', 'pass', forcesText + ' · residual ' + Math.abs(eq.residual.Fz).toExponential(1) + ' N', 'Statics; linear strain field'));
  }
  let bearing = null;
  if (fem && eq.C > 0) {
    const capacity = eq.bearing.FcRd + (eq.allCompression ? eq.bearingTop.FcRd : 0);
    const area = eq.bearing.area + (eq.allCompression ? eq.bearingTop.area : 0);
    bearing = { ratio: eq.C / capacity, area, stress: eq.C / area };
    rows.push(ur('Load path', 'Concrete bearing under compression flange', bearing.ratio,
      'C = ' + kN(eq.C) + ' (FEM) vs F_c,Rd = ' + kN(capacity) + ' · c = ' + mm(eq.bearing.c) + ' · f_jd = ' + fjd.toFixed(2) + ' MPa',
      'EN 1993-1-8 §6.2.5, Eq. 6.4–6.6; EN 1992-1-1 Eq. 6.63'));
    rows.push(info('Load path', 'Peak contact pressure (FEM)', eq.fem.pMax <= fjd ? 'pass' : 'incomplete', 'p_max = ' + eq.fem.pMax.toFixed(2) + ' MPa vs f_jd = ' + fjd.toFixed(2)
      + ' MPa' + (eq.fem.pMax > fjd ? '; elastic peak exceeds the joint strength. Independent engineering verification is required.' : '') + ' · k_c = ' + eq.fem.kc.toFixed(3) + ' N/mm³', 'EN 1993-1-8 Table 6.11 (k13)'));
  } else if (fem) {
    // no bearing: pure tension
  } else if (o.method === 'component') {
    const demand = Math.max(eq.Cbot ?? eq.C, 0);
    const top = eq.Ctop ? eq.Ctop / eq.bearingTop.FcRd : 0;
    bearing = { ratio: Math.max(demand / eq.bearing.FcRd, top), area: eq.bearing.area, stress: demand / eq.bearing.area };
    rows.push(ur('Load path', 'Concrete bearing under compression flange', bearing.ratio,
      'F_c,Rd = f_jd·b_eff·l_eff = ' + kN(eq.bearing.FcRd) + ' · c = ' + mm(eq.bearing.c) + ' · f_jd = ' + fjd.toFixed(2) + ' MPa',
      'EN 1993-1-8 §6.2.5, Eq. 6.4–6.6; EN 1992-1-1 Eq. 6.63'));
  } else if (!eq.unsupported) {
    bearing = { ratio: eq.x / plate.H, area: eq.block.area, stress: fjd };
    rows.push(ur('Load path', 'Concrete bearing block depth x / H', bearing.ratio, 'x = ' + mm(eq.x) + ' · f_jd = ' + fjd.toFixed(2) + ' MPa over B = ' + mm(plate.B), 'EN 1993-1-8 §6.2.5'));
  }
  if (!fem && o.method === 'block') {
    const c = plate.t * Math.sqrt(grade.fy / (3 * fjd));
    if (plate.B > member.b + 2 * c) {
      rows.push(info('Load path', 'Full-width bearing block', 'warning', 'Plate width ' + mm(plate.B) + ' exceeds b + 2c = ' + mm(member.b + 2 * c)
        + '; the plate is too flexible to spread bearing across its full width. Use the component model.', 'EN 1993-1-8 §6.2.5(4)'));
    }
  }
  if (bearing && eq.C > 0) {
    const limit = concrete.nuPrime * concrete.fcd;
    rows.push(info('Load path', 'Bearing node stress (CCC)', bearing.stress <= limit ? 'pass' : 'warning',
      'σ = ' + bearing.stress.toFixed(2) + ' MPa vs k1·ν′·f_cd = ' + limit.toFixed(2) + ' MPa' + (bearing.stress > limit ? '; relies on §6.7 spread (α > 1)' : ''),
      'EN 1992-1-1 §6.5.4, Eq. 6.60'));
  }

  // Welded reinforcement
  const loaded = barResults.filter(bar => bar.F > 0);
  if (loaded.length) {
    const g = 'Welded bars';
    const steel = worst(loaded, bar => bar.F / bar.steel.FRd);
    rows.push(ur(g, 'Bar tension, A_s·f_yd', steel.F / steel.steel.FRd, steel.id + ' · F = ' + kN(steel.F) + ' / ' + kN(steel.steel.FRd), 'EN 1992-1-1 §3.2.7'));
    const weld = worst(loaded, bar => bar.F / bar.weld.FRd);
    rows.push(ur(g, 'Bar-to-plate fillet weld', weld.F / weld.weld.FRd, weld.id + ' · a = ' + mm(rebars.throat) + ', L = πØ · F_w,Rd = ' + kN(weld.weld.FRd)
      + ' · procedure to EN ISO 17660-1', 'EN 1993-1-8 §4.5.3.3, Eq. 4.4'));
    const brittle = barResults.filter(bar => bar.weld.FRd < bar.steel.FRd);
    if (brittle.length) rows.push(info(g, 'Weld weaker than bar yield', 'warning', 'Weld resistance ' + kN(brittle[0].weld.FRd) + ' < A_s·f_yd = ' + kN(brittle[0].steel.FRd) + '; the bar cannot yield before the weld', 'Capacity design'));
    const punch = worst(loaded, bar => bar.F / bar.punch.FRd);
    rows.push(ur(g, 'Plate shear around welded bar', punch.F / punch.punch.FRd, punch.id + ' · V_Rd = ' + kN(punch.punch.FRd), 'EN 1993-1-1 Eq. 6.18 (perimeter shear)'));
    const anchor = worst(loaded, bar => bar.anchor.ratio);
    rows.push(ur(g, 'Anchorage length l_bd ≤ l_b,prov', anchor.anchor.ratio, anchor.id + ' · σ_sd = ' + anchor.sigma.toFixed(0) + ' MPa · l_bd = ' + mm(anchor.anchor.lbd) + ' vs ' + mm(rebars.length)
      + ' · f_bd = ' + anchor.anchor.fbd.toFixed(2) + ' MPa · α1 = ' + anchor.anchor.alpha1, 'EN 1992-1-1 §8.4, Eq. 8.2–8.6'));
  }
  if (layout.rows.length && rebars.shape === 'straight' && plate.t + rebars.length > c.thickness - 40) {
    rows.push(info('Welded bars', 'Straight bar fits in the member', 'fail', 't + l_b,prov = ' + mm(plate.t + rebars.length) + ' exceeds h − 40 mm cover; bend the bars or shorten them', 'Geometry'));
  }
  if (layout.rows.length && rebars.shape === 'bent') {
    const need = Math.max(...layout.rows.map(row => minMandrel(row.d)));
    rows.push(ur('Welded bars', 'Bend mandrel diameter', need / rebars.mandrel, 'φ_m = ' + mm(rebars.mandrel) + ' ≥ ' + mm(need) + '; bearing inside the bend not checked', 'EN 1992-1-1 Table 8.1N'));
  }

  // Plate bending
  const plateRows = layout.rows.map(row => rowBending(row, barResults, { plate, member, plateGrade: grade, rebars, concrete }));
  for (const row of plateRows) {
    const label = 'Plate bending at bar row ' + (row.index + 1);
    if (row.kind === 'unloaded') continue;
    if (row.kind === 'inside') rows.push(info('Plate', label, 'incomplete', 'Row lies inside the member outline; two-way plate bending between member walls is not covered', 'Outside scope'));
    else if (row.kind === 'flange') rows.push(info('Plate', label, 'pass', 'Row lies behind the tension flange; force passes directly through the plate', 'Direct bearing'));
    else rows.push(ur('Plate', label, row.F / row.FRd, 'm = ' + mm(row.m) + ' · l_eff = ' + mm(row.leff) + ' · t_req = ' + row.tReq.toFixed(1) + ' mm', 'EN 1993-1-8 Table 6.4 patterns; strip M_pl,Rd = l_eff·t²·f_y/4'));
  }
  const cantilevers = plateRows.filter(row => row.kind === 'cantilever');
  if (fem) {
    const f = eq.fem;
    const limit = grade.fy / GAMMA.M0;
    rows.push(info('Plate', 'Plate elastic stress (FEM)', f.vmMax <= limit ? 'pass' : 'warning', 'σ_vM,max = ' + f.vmMax.toFixed(0) + ' MPa vs f_y/γ_M0 = ' + limit.toFixed(0)
      + ' MPa at (' + f.vmAt.x.toFixed(0) + ', ' + f.vmAt.y.toFixed(0) + ')' + (f.vmMax > limit ? '; local yielding, the yield-line check above governs resistance' : '')
      + ' · w = ' + f.wMin.toFixed(3) + '…' + f.wMax.toFixed(3) + ' mm', 'EN 1993-1-1 Eq. 6.1 (elastic, element centres)'));
    if (barsOnly) {
      rows.push(info('Plate', 'Bar and stud tension bounded', 'pass', 'Bars from the run without stud tension (ΣT_bars = ' + kN(barsOnly.T) + '), studs from the run with stiff stud springs (ΣN = '
        + kN(eq.tensions.filter(e => e.kind === 'stud').reduce((sum, e) => sum + e.F, 0)) + '); each component is checked for its upper bound', 'Stiffness bounding, see help §2b'));
    }
    const dev = rigidDeviation(eq.tensions, rigid.tensions ?? []);
    rows.push(info('Plate', 'Flexible vs rigid plate', 'pass', 'ΣT = ' + kN(eq.T) + ' (FEM) vs ' + kN(rigid.T ?? 0) + ' (rigid)'
      + (eq.lever && rigid.lever ? ' · z = ' + mm(eq.lever) + ' vs ' + mm(rigid.lever) : '')
      + (dev ? ' · deviation: max element ' + pct(dev.max) + ', sum ' + pct(dev.sum) + ', non-linearity ' + pct(dev.linearity) : ''),
      'Close-to-rigid criteria after Hilti (max force, sum, linearity)'));
  } else if (cantilevers.length) {
    const soft = worst(cantilevers, row => -row.stiffness.ratio);
    rows.push(info('Plate', 'Rigid-plate assumption', soft.stiffness.ratio >= 10 ? 'pass' : 'warning',
      'k_plate / k_bars = ' + soft.stiffness.ratio.toFixed(1) + (soft.stiffness.ratio >= 10 ? ' ≥ 10' : ' < 10: plate bending redistributes bar and stud forces; verify with a plate (FE) model'),
      'Engineering criterion, not a code rule'));
  }

  // Headed studs: shear
  const g = 'Headed studs';
  const friction = o.friction && N < 0 ? 0.2 * -N : 0; // EN 1993-1-8 §6.2.2(6), C_f,d = 0.20
  const Vstuds = Math.max(V - friction, 0);
  const Vi = Vstuds / studs.length; // EN 1992-4 §6.2.2: welded studs, no hole clearance, all take shear
  const vs = steelShear(s);
  const VRds = vs.VRk / gammas.MsV;
  rows.push(ur(g, 'Stud steel shear', Vi / VRds, 'V_Ed,i = ' + kN(Vi) + ' · V_Rd,s = ' + kN(VRds) + ' · γ_Ms = ' + gammas.MsV.toFixed(2)
    + (friction ? ' · friction ' + kN(friction) + ' deducted' : ''), 'EN 1992-4 Eq. 7.34–7.35'));
  const tensioned = studLoads.filter(stud => stud.F > 1e-6);
  const groupCone = coneResistance(studs, { hef: s.hef, fck: c.fck, cracked: c.cracked, dense: c.denseReinforcement, edges: c.edges });
  const VRdcp = s.k8 * groupCone.NRk / gammas.Mc;
  rows.push(ur(g, 'Concrete pry-out', Vstuds / VRdcp, 'V_Rd,cp = k8·N_Rk,c/γ_Mc = ' + kN(VRdcp) + ' · k8 = ' + s.k8 + ' (product data)', 'EN 1992-4 Eq. 7.39a'));
  let edgeRatio = 0;
  const studRowList = studRows(studs);
  if (c.edges.bottom === null) {
    rows.push(info(g, 'Concrete edge breakout', 'off', 'No free edge in the shear direction', 'EN 1992-4 §7.2.2.5'));
  } else {
    const params = { d: s.d, hef: s.hef, fck: c.fck, cracked: c.cracked, thickness: c.thickness, edges: c.edges, edgeReinforcement: c.edgeReinforcement };
    const front = edgeResistance(studRowList[0], params);
    const cases = [{ name: 'front row, its share', V: Vstuds * front.n / studs.length, r: front }];
    if (studRowList.length > 1) cases.push({ name: 'rear row, full shear', V: Vstuds, r: edgeResistance(studRowList.at(-1), params) });
    const governing = worst(cases, item => item.V * gammas.Mc / item.r.VRk);
    edgeRatio = governing.V * gammas.Mc / governing.r.VRk;
    rows.push(ur(g, 'Concrete edge breakout', edgeRatio, governing.name + ' · c1 = ' + mm(governing.r.c1) + (governing.r.narrow ? ' (c1′, narrow member)' : '')
      + ' · V_Rd,c = ' + kN(governing.r.VRk / gammas.Mc), 'EN 1992-4 Eq. 7.40–7.46'));
  }

  // Headed studs: tension
  const NRds = shankArea(s.d) * s.fuk / gammas.MsN;
  let betaN = 0;
  if (!shared) {
    const inZone = fem ? studs.filter(stud => femUplift(eq.fem, stud) > 0) : eq.allCompression ? [] : eq.yC === null ? studs : studs.filter(stud => stud.y > eq.yC);
    rows.push(info(g, 'Stud tension', inZone.length ? 'incomplete' : 'pass', inZone.length
      ? inZone.map(stud => stud.id).join(', ') + (fem ? ' lift off the concrete in the FEM model;' : ' lie in the tension zone;') + ' their tension is neglected by assumption. Plate deformation will load them; select "Studs share tension" to check them'
      : 'All studs lie in the compression zone', 'Design assumption'));
  } else if (tensioned.length) {
    const stud = worst(tensioned, item => item.F);
    rows.push(ur(g, 'Stud steel tension', stud.F / NRds, stud.id + ' · N_Ed = ' + kN(stud.F) + ' · N_Rd,s = ' + kN(NRds) + ' · γ_Ms = ' + gammas.MsN.toFixed(2), 'EN 1992-4 §7.2.1.3'));
    const cone = coneResistance(tensioned, { hef: s.hef, fck: c.fck, cracked: c.cracked, dense: c.denseReinforcement, edges: c.edges });
    const Ng = tensioned.reduce((sum, item) => sum + item.F, 0);
    const coneRatio = Ng * gammas.Mc / cone.NRk;
    rows.push(ur(g, 'Concrete cone (tensioned studs)', coneRatio, 'N_Ed,g = ' + kN(Ng) + ' · N_Rd,c = ' + kN(cone.NRk / gammas.Mc) + ' · A_c,N/A⁰ = ' + (cone.Ac / cone.A0).toFixed(2)
      + ' · ψ_ec,N = ' + cone.psiEc.toFixed(3) + (cone.narrow ? ' · h′_ef = ' + mm(cone.hef) : ''), 'EN 1992-4 Eq. 7.1–7.9'));
    const pull = pulloutResistance({ d: s.d, dh: s.dh, fck: c.fck, cracked: c.cracked });
    const pullRatio = stud.F * gammas.Mp / pull.NRk;
    rows.push(ur(g, 'Pull-out', pullRatio, 'N_Rd,p = ' + kN(pull.NRk / gammas.Mp), 'EN 1992-4 Eq. 7.11–7.12'));
    const AsRe = 0.5 * Ng / (500 / GAMMA.MsRe);
    rows.push(info(g, 'Splitting', 'incomplete',
      'Verify the member and product distances or provide developed splitting reinforcement and a crack-width check. Historical tie area estimate ' + AsRe.toFixed(0) + ' mm².',
      'EN 1992-4 §7.2.1.7(2)b, Eq. 7.22'));
    const near = tensioned.filter(item => Math.min(...Object.values(edgeDistances(item, c.edges))) <= 0.5 * s.hef);
    rows.push(near.length ? info(g, 'Side-face blow-out', 'incomplete', near.map(item => item.id).join(', ') + ' within 0.5·h_ef of an edge; blow-out is not implemented', 'EN 1992-4 §7.2.1.8')
      : info(g, 'Side-face blow-out', 'pass', 'Not required: c > 0.5·h_ef', 'EN 1992-4 §7.2.1.8'));
    betaN = Math.max(coneRatio, pullRatio);
    const steelInt = Math.max(...studLoads.map(item => steelInteraction(item.F / NRds, Vi / VRds)));
    rows.push(ur(g, 'Steel interaction N–V', steelInt, '(N/N_Rd,s)² + (V/V_Rd,s)²', 'EN 1992-4 Eq. 7.54'));
  }
  const betaV = Math.max(edgeRatio, Vstuds / VRdcp);
  if (betaN > 0) {
    const text = 'β_N = ' + betaN.toFixed(3) + ' · β_V = ' + betaV.toFixed(3);
    rows.push(Math.max(betaN, betaV) > 1
      ? info(g, 'Concrete interaction N–V', 'fail', text + '; a concrete failure mode already exceeds its resistance', 'EN 1992-4 Eq. 7.55')
      : ur(g, 'Concrete interaction N–V', concreteInteraction(betaN, betaV), text + ' · exponent 1.5', 'EN 1992-4 Eq. 7.55'));
  }

  rows.push(info('Load path', 'Transfer into the receiving member (STM, laps)', 'incomplete',
    'Independent engineering verification is required for the bar ties, bearing strut and breakout bodies in the receiving member.',
    'EN 1992-1-1 §6.5; §8.7 laps'));

  const status = rows.some(row => row.status === 'fail') ? 'Fail' : rows.some(row => row.status === 'incomplete') ? 'Incomplete'
    : rows.some(row => row.status === 'warning') ? 'Pass with warnings' : 'Pass';
  return { input, layout, concrete, grade, fjd, gammas, actions: { N, V, M }, eq, rigid, bars: barResults, studs: studLoads, plateRows, groupCone, rows, status, Vi, friction };
}
