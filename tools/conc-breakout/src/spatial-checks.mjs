import {
  coneResistance, concreteInteraction, edgeDistances, edgeResistance, pulloutResistance, steelInteraction, steelShear,
} from './anchors.mjs';
import { GAMMA } from './materials.mjs';
import { minMandrel } from './rebar.mjs';

const kN = value => (value / 1000).toFixed(2) + ' kN';
const limit = 0.05; // N, same absolute force floor as the equilibrium check
export const information = (group, label, status, detail, ref) => ({ group, label, status, detail, ref, hideRatio: true });

function utilization(group, label, ratio, detail, ref) {
  return {
    group, label, ratio: Number.isFinite(ratio) ? ratio : null, detail, ref,
    status: Number.isFinite(ratio) ? ratio > 1 + 1e-9 ? 'fail' : 'pass' : 'incomplete',
    isUR: Number.isFinite(ratio),
  };
}

export function engineeringStatus(rows) {
  if (rows.some(row => row.status === 'fail')) return 'Fail';
  if (rows.some(row => row.status === 'incomplete')) return 'Incomplete';
  return 'Pass';
}

export function studChecks(input, studs, eq, gammas, loads) {
  if (!studs.length) return [];
  const { studs: s, concrete: c } = input;
  const material = { ...s, fck: c.fck, cracked: c.cracked };
  const group = 'Headed studs';
  const vs = steelShear(s).VRk / gammas.MsV;
  const vp = pulloutResistance(material).NRk / gammas.Mp;
  const rows = [];
  for (const stud of studs) {
    stud.NRd = stud.area * s.fuk / gammas.MsN;
    stud.VRd = vs;
    stud.pulloutRd = vp;
    const v = Math.hypot(stud.Vx, stud.Vy);
    stud.ratios = { tension: stud.F / stud.NRd, shear: v / vs, pullout: stud.F / vp };
    if (stud.F > limit || v > limit) {
      rows.push(utilization(group, stud.id + ' steel tension', stud.ratios.tension,
        kN(stud.F) + ' / ' + kN(stud.NRd), 'EN 1992-4:2018 §7.2.1.3'));
      if (eq.membrane) rows.push(utilization(group, stud.id + ' steel shear', stud.ratios.shear,
        kN(v) + ' / ' + kN(vs), 'EN 1992-4:2018 §7.2.2.3'));
      if (stud.F > limit) rows.push(utilization(group, stud.id + ' pull-out', stud.ratios.pullout,
        kN(stud.F) + ' / ' + kN(vp), 'EN 1992-4:2018 §7.2.1.5'));
      if (stud.F > limit && v > limit) rows.push(utilization('Interaction', stud.id + ' steel tension–shear',
        steelInteraction(stud.ratios.tension, stud.ratios.shear), 'Squared steel tension and shear ratios', 'EN 1992-4:2018 Eq. 7.54'));
    }
  }
  const concrete = { ...material, edges: c.edges, dense: false };
  const tensioned = studs.filter(stud => stud.F > limit);
  const sheared = studs.filter(stud => Math.hypot(stud.Vx, stud.Vy) > limit);
  const shearDemand = sheared.reduce((sum, stud) => sum + Math.hypot(stud.Vx, stud.Vy), 0);
  const tensionDemand = tensioned.reduce((sum, stud) => sum + stud.F, 0);
  let tensionRatio = 0;
  let shearRatio = 0;
  // Single-fastener screens and projected group resistance serve different failure surfaces.
  if (tensioned.length) {
    const cone = coneResistance(tensioned, concrete);
    const rd = cone.NRk / gammas.Mc;
    tensionRatio = tensionDemand / rd;
    rows.push(utilization('Concrete', 'Stud group cone', tensionRatio,
      kN(tensionDemand) + ' / ' + kN(rd) + ' · eccentricity factor ' + cone.psiEc.toFixed(3), 'EN 1992-4:2018 Eq. 7.1–7.9'));
    for (const stud of tensioned) {
      const ratio = stud.F * gammas.Mc / coneResistance([stud], concrete).NRk;
      tensionRatio = Math.max(tensionRatio, ratio, stud.ratios.pullout);
      rows.push(utilization('Concrete', stud.id + ' single cone screen', ratio, 'Individual tension force ' + kN(stud.F), 'EN 1992-4:2018 §7.2.1.4'));
    }
    const near = tensioned.filter(stud => Math.min(...Object.values(edgeDistances(stud, c.edges))) <= 0.5 * s.hef);
    if (near.length) rows.push(information('Concrete', 'Side-face blow-out', 'incomplete', near.map(e => e.id).join(', ') + ' require a blow-out calculation.', 'EN 1992-4:2018 §7.2.1.8'));
    rows.push(information('Concrete', 'Splitting and product limits', 'incomplete',
      'Check edge and spacing distances, member thickness, product splitting distances or developed reinforcement and crack width. Calculated supplementary tie area for the existing k4 = 0.5, fyk = 500 MPa option is '
      + (0.5 * tensionDemand * GAMMA.MsRe / 500).toFixed(0) + ' mm².', 'EN 1992-4:2018 §7.2.1.7'));
  }
  if (sheared.length) {
    if (s.productReference?.trim()) {
      // Sum of shear magnitudes avoids cancellation under torsion. The group screen does
      // not establish the code resistance for oppositely loaded or non-uniform subgroups.
      const groupCone = coneResistance(sheared.map(stud => ({ ...stud, F: Math.hypot(stud.Vx, stud.Vy) })), concrete);
      const rd = s.k8 * groupCone.NRk / gammas.Mc;
      shearRatio = shearDemand / rd;
      rows.push(utilization('Concrete', 'Stud group pry-out screen', shearRatio, kN(shearDemand) + ' / ' + kN(rd),
        'EN 1992-4:2018 §7.2.2.4'));
      if (loads.Mz || tensioned.length) rows.push(information('Concrete', 'Pry-out case coverage', 'incomplete',
        'Verify relevant directional subgroups and any effect of accompanying tension.', 'EN 1992-4:2018 §7.2.2.4'));
    } else {
      rows.push(information('Concrete', 'Pry-out product data', 'incomplete', 'Enter the source of the specified k8.', 'EN 1992-4:2018 §7.2.2.4'));
    }
    // Reuse the verified perpendicular single-fastener chain. Multi-row, oblique and
    // eccentric groups require separate code applicability and resistance checks.
    if (Object.values(c.edges).some(edge => edge !== null)) {
      if (sheared.length === 1 && loads.Vy < 0 && !loads.Vx && !loads.Mz && c.edges.bottom !== null) {
        const rd = edgeResistance(sheared, { ...concrete, thickness: c.thickness, edgeReinforcement: false }).VRk / gammas.Mc;
        shearRatio = Math.max(shearRatio, shearDemand / rd);
        rows.push(utilization('Concrete', 'Perpendicular bottom-edge breakout', shearDemand / rd,
          kN(shearDemand) + ' / ' + kN(rd), 'EN 1992-4:2018 Eq. 7.40–7.46'));
      } else {
        rows.push(information('Concrete', 'Directional edge breakout', 'incomplete',
          'Check each relevant edge with the calculated signed anchor forces, edge-group eccentricity and applicable angle factors.', 'EN 1992-4:2018 §7.2.2.5'));
      }
    }
    if (tensionRatio && shearRatio) rows.push(utilization('Interaction', 'Concrete tension–shear screen',
      Math.max(tensionRatio, shearRatio) > 1 ? Math.max(tensionRatio, shearRatio) : concreteInteraction(tensionRatio, shearRatio),
      'Governing available concrete tension and shear ratios. Incomplete component checks remain open.', 'EN 1992-4:2018 Eq. 7.55'));
  }
  return rows;
}

export function barVerification(input, bars) {
  const { rebars, concrete, plate } = input;
  const group = 'Welded bars';
  const rows = [];
  for (const bar of bars.filter(item => item.F > limit)) {
    const ref = 'EN 1992-1-1:2004 §8.4';
    rows.push(utilization(group, bar.id + ' steel tension', bar.F / bar.steel.FRd, kN(bar.F) + ' / ' + kN(bar.steel.FRd), 'EN 1992-1-1:2004 §3.2.7'));
    rows.push(utilization(group, bar.id + ' fillet weld screen', bar.F / bar.weld.FRd, 'Full circular effective weld assumed.', 'EN 1993-1-8:2005 §4.5.3.3'));
    rows.push(utilization(group, bar.id + ' local plate shear screen', bar.F / bar.punch.FRd, 'Weld-toe perimeter shear.', 'EN 1993-1-1:2005 Eq. 6.18'));
    rows.push(utilization(group, bar.id + ' anchorage length', bar.anchor.ratio,
      bar.anchor.lbd.toFixed(1) + ' / ' + rebars.length + ' mm', ref));
    if (rebars.shape === 'straight' && Number.isFinite(rebars.backCover)) {
      rows.push(utilization(group, bar.id + ' fit within member',
        (plate.t + rebars.length + rebars.backCover) / concrete.thickness, 'Straight bar plus plate and rear cover.', 'Geometry'));
    }
    if (rebars.shape === 'bent') rows.push(utilization(group, bar.id + ' mandrel diameter',
      minMandrel(bar.d) / rebars.mandrel, 'Minimum mandrel diameter only. Check concrete pressure inside bend.', 'EN 1992-1-1:2004 Table 8.1N'));
  }
  if (rows.length) rows.push(information(group, 'Bar detailing and load-bearing weld qualification', 'incomplete',
    'Verify side and rear cover, clear spacing, bend fit and local splitting. Supply weldability and the qualified welding procedure for the load-bearing joint.', 'EN 1992-1-1:2004 §8 and EN ISO 17660-1'));
  return rows;
}

export function plateVerification(eq, grade, fjd, t) {
  let peak = 0;
  for (const [index, element] of eq.fem.elements.entries()) {
    const stress = eq.membrane?.stresses[index] ?? [0, 0, 0];
    const bending = [element.M.Mx, element.M.My, element.M.Mxy].map(value => 6 * value / (t * t));
    for (const sign of [-1, 1]) {
      const [x, y, shear] = stress.map((value, k) => value + sign * bending[k]);
      element.combinedVm = Math.max(element.combinedVm ?? 0, Math.sqrt(x * x + y * y - x * y + 3 * shear * shear));
    }
    peak = Math.max(peak, element.combinedVm);
  }
  return [
    utilization('Steel plate', 'Elastic bending and membrane stress screen', peak / (grade.fy / GAMMA.M0),
      peak.toFixed(1) + ' MPa at element centres, both surfaces.', 'EN 1993-1-1:2005 Eq. 6.1'),
    information('Steel plate', 'Local resistance and member-to-plate welds', 'incomplete',
      'Verify section shear, weld group actions, local load introduction and any plastic mechanism separately.', 'EN 1993-1-1:2005 §6 and EN 1993-1-8:2005 §4'),
    ...(eq.C > limit ? [information('Concrete', 'Bearing and local bearing pressure', 'incomplete',
      'Elastic contact peak ' + eq.fem.pMax.toFixed(2) + ' MPa, benchmark joint strength ' + fjd.toFixed(2)
      + ' MPa. Verify effective bearing area, nodal zones and concrete resistance independently of the elastic pressure field.', 'EN 1992-1-1:2004 §6.5 and §6.7')] : []),
  ];
}
