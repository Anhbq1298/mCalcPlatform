// Checks of a link layout against §6.4.5 and §9.4.3 (recommended values).
// The Eq. 6.52 check conservatively uses the smallest effective A_sw of any layer and the largest
// radial spacing between consecutive layers.
import { STATES } from './inputs.mjs';
import { CODE_PARAMETERS as P, fywdEffective, minimumLegArea, reinforcedResistance } from './resistance.mjs';

export function row(id, clause, label, demand, resistance, status, extra = {}) {
  const ur = resistance > 0 && Number.isFinite(demand) ? demand / resistance : null;
  return { id, clause, label, demand, resistance, ur, status: status ?? (ur !== null && ur <= 1 + 1e-9 ? STATES.pass : STATES.fail), ...extra };
}

export function checkLayout({ d, fck, fyk, vRdc, vEd, u1, aOut, summary, links, kMax = P.kMax, kMaxLabel = 'k_max·v_Rd,c', detailing }) {
  const rows = [];
  const layerRows = [];
  const fywdEf = fywdEffective(fyk, d);
  if (!summary.length) {
    const status = STATES.fail;
    return {
      fywdEf, layerRows,
      rows: [row('reinforced', '§6.4.5, Eq. 6.52', 'Reinforced punching resistance', vEd, 0.75 * vRdc, status, { unit: 'MPa', detail: 'No links provided.' })],
    };
  }
  const offsets = summary.map(layer => layer.offset);
  const spacings = offsets.slice(1).map((offset, i) => offset - offsets[i]);
  const ordered = spacings.every(value => value > 0);
  const srMax = spacings.length ? Math.max(...spacings) : null;
  const aswMin = Math.min(...summary.map(layer => layer.asw));
  const governingLayer = summary.find(layer => layer.asw === aswMin);

  if (srMax !== null && ordered) {
    const vRdcs = reinforcedResistance({ vRdc, d, sr: srMax, asw: aswMin, fywdEf, u1 });
    rows.push(row('reinforced', '§6.4.5(1), Eq. 6.52', 'Reinforced punching resistance at u1', vEd, vRdcs, null, {
      unit: 'MPa', detail: `A_sw = ${aswMin.toFixed(0)} mm² (${governingLayer.id}), s_r = ${srMax.toFixed(0)} mm, f_ywd,ef = ${fywdEf.toFixed(1)} MPa`, vRdcs, srMax, aswMin,
    }));
  } else {
    rows.push(row('reinforced', '§6.4.5(1), Eq. 6.52', 'Reinforced punching resistance at u1', vEd, 0, ordered ? STATES.fail : STATES.incomplete, {
      unit: 'MPa', detail: ordered ? 'At least two layers are needed to define s_r.' : 'Layer offsets must increase from L1 outward.',
    }));
  }
  rows.push(row('kmax', kMaxLabel.includes('UK') ? 'UK NA 6.4.5(3)' : '§6.4.5(1) Note, A1:2014', 'Upper limit with links, ' + kMaxLabel, vEd, kMax * vRdc, null, { unit: 'MPa' }));

  const outermost = Math.max(...offsets);
  const needed = aOut - P.outerK * d;
  rows.push(row('outer', '§6.4.5(4), Eq. 6.54', 'Outer coverage: outermost layer ≥ a_out − 1.5d', Math.max(needed, 0), outermost, null, {
    unit: 'mm', detail: `a_out = ${aOut.toFixed(0)} mm, required ${Math.max(needed, 0).toFixed(0)} mm, provided ${outermost.toFixed(0)} mm`, governing: summary[offsets.indexOf(outermost)].id,
  }));
  rows.push(row('perimeters', '§9.4.3(1)', 'At least two perimeters of link legs', 2, summary.length, summary.length >= 2 ? STATES.pass : STATES.fail, { unit: 'layers' }));

  const first = offsets[0];
  rows.push(row('first', '§9.4.3(4)', 'First layer ≤ 0.5d from the loaded area', first, P.firstLayerMax * d, null, { unit: 'mm', governing: 'L1' }));
  if (first < P.firstLayerMin * d) {
    rows.push(row('first-min', 'The Concrete Centre guidance', 'First layer ≥ 0.3d (guidance, not a code limit)', P.firstLayerMin * d, first, STATES.confirm, { unit: 'mm' }));
  }
  const radialLimit = P.radialSpacing * d;
  rows.push(row('radial', '§9.4.3(1)', 'Radial spacing s_r ≤ 0.75d', srMax ?? 0, radialLimit, srMax === null ? STATES.incomplete : ordered ? null : STATES.fail, {
    unit: 'mm', governing: srMax === null ? null : 'L' + (spacings.indexOf(srMax) + 2),
  }));

  let worstTangential = null;
  let worstMinimum = null;
  summary.forEach((layer, i) => {
    const limit = (layer.offset <= 2 * d ? P.tangentialInside : P.tangentialOutside) * d;
    const adjacent = [spacings[i - 1], spacings[i]].filter(value => value > 0);
    const sr = adjacent.length ? Math.max(...adjacent) : radialLimit;
    const legArea = layer.asw / Math.max(layer.effectiveLegs, 1);
    const minArea = minimumLegArea({ fck, fyk, sr, st: layer.tangential.max });
    const tangential = row('tangential-' + layer.id, '§9.4.3(1)', `${layer.id} tangential spacing ≤ ${limit === 1.5 * d ? '1.5d' : '2d'}`, layer.tangential.max, limit, null, { unit: 'mm', governing: layer.id });
    const minimum = row('minimum-' + layer.id, '§9.4.3(2), Eq. 9.11', `${layer.id} minimum leg area`, minArea, layer.effectiveLegs ? legArea : 0, layer.effectiveLegs ? null : STATES.fail, { unit: 'mm²', governing: layer.id });
    const placement = layer.ineffective.length
      ? row('legs-' + layer.id, '§6.4.5', `${layer.id} legs outside the slab or in openings`, layer.ineffective.length, 0, STATES.fail, { unit: 'legs', detail: layer.ineffective.map(leg => leg.id + ' ' + leg.reason).join(', ') })
      : null;
    layerRows.push({ layer, limit, sr, minArea, legArea, tangential, minimum, placement });
    if (!worstTangential || (tangential.ur ?? Infinity) > (worstTangential.ur ?? Infinity)) worstTangential = tangential;
    if (!worstMinimum || (minimum.ur ?? Infinity) > (worstMinimum.ur ?? Infinity)) worstMinimum = minimum;
  });
  rows.push({ ...worstTangential, id: 'tangential', label: 'Tangential spacing (governing layer)' });
  rows.push({ ...worstMinimum, id: 'minimum', label: 'Minimum link leg area (governing layer)' });
  for (const { placement } of layerRows) if (placement) rows.push(placement);
  const legs = links.reduce((sum, link) => sum + link.legs.length, 0);
  const problems = detailing ? detailing.rows.filter(entry => entry.status !== STATES.pass).map(entry => entry.label + ' (' + entry.status + ')') : [];
  rows.push(row('anchorage', '§8.3, §8.5, §9.3.2(1)', 'Link anchorage and physical detailing', null, null, detailing?.status ?? STATES.confirm, {
    detail: `${links.length} links, ${legs} legs. ` + (problems.length ? problems.join('; ') : 'All detailing checks satisfied.'),
  }));
  return { rows, layerRows, fywdEf };
}
