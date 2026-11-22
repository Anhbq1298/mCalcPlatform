// Links around a rectangular column head with l_H ≤ 2h_H (Fig. 6.17). EN 1992-1-1 checks this case on
// an equivalent circle (r_cont, Eq. 6.34/6.35) but gives no rule for links. The tool keeps two
// geometries apart:
//   - check section: the EC2 equivalent circle (u1 at r_cont, v_Ed, v_Rd,c, u_out,ef);
//   - link geometry: rounded rectangles at offset t from the actual head outline.
// The links are mapped to the circle by angular sectors from the column centroid: each sector of the
// circle carries its share Δθ/2π of the required A_sw per perimeter, and a leg counts only in the
// sector that contains it (no double counting). Coverage of u_out,ef uses the nearest point of the
// outermost layer (mid-side of the shortest head side). The mapping is a proposed method, not an
// EC2 rule: the reinforced checks that depend on it report Not verified (Fail stays Fail) until it
// is benchmarked.
import { STATES } from './inputs.mjs';
import { buildLinks, layerSummary, LINK_SHAPES } from './layout.mjs';
import { barArea, CODE_PARAMETERS as P, minimumLegArea } from './resistance.mjs';
import { checkLayout, row } from './reinforcement-checks.mjs';
import { detailingChecks } from './detailing.mjs';

export const SECTORS = 16;
const MAPPED = new Set(['reinforced', 'outer']);

// Effective leg area per angular sector for each layer; worst ratio provided / required share.
export function sectorCoverage(links, summary, centre, aswReq, sectors = SECTORS) {
  const share = aswReq / sectors;
  return summary.map(layer => {
    const areas = new Array(sectors).fill(0);
    for (const link of links.filter(item => item.layerId === layer.id)) {
      for (const leg of link.legs.filter(item => item.effective)) {
        const angle = Math.atan2(leg.y - centre.y, leg.x - centre.x);
        const k = Math.floor((((angle / (2 * Math.PI)) % 1 + 1) % 1) * sectors + 1e-9) % sectors;
        areas[k] += barArea(link.diameter);
      }
    }
    const min = Math.min(...areas);
    return { id: layer.id, areas, min, sector: areas.indexOf(min), share, ur: share > 0 ? (min > 0 ? share / min : Infinity) : 0 };
  });
}

// Automatic layout on the head outline: layers at first + k·s_r until the nearest point of the last
// layer is within 1.5d of u_out,ef on the circle; per layer the smallest link count that meets the
// tangential spacing, Eq. 9.11, the total A_sw and every sector share.
function autoMapped({ model, d, aswReq, tOut, fck, fyk, diameter, shape, centre }) {
  const first = Math.max(Math.ceil((P.firstLayerMin * d) / 5) * 5, Math.floor((0.4 * d) / 5) * 5);
  const sr = Math.floor((P.radialSpacing * d) / 5 + 1e-9) * 5;
  const count = Math.max(2, Math.ceil((Math.max(tOut - P.outerK * d, first) - first) / sr - 1e-9) + 1);
  const perLink = LINK_SHAPES[shape].legs;
  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const offset = first + i * sr;
    const geometry = model.intervalsAt(offset);
    const stLimit = (offset <= 2 * d ? P.tangentialInside : P.tangentialOutside) * d;
    const start = Math.max(SECTORS, Math.ceil(Math.max(aswReq / barArea(diameter), geometry.total / stLimit) / perLink - 1e-9));
    let found = null;
    for (let links = start; links <= start + 2000 && !found; links += 1) {
      const layer = { offset, diameter, shape, links, start: 0, omitted: [] };
      const built = buildLinks(model, [layer], 'auto', layers.length);
      const summary = layerSummary(model, [layer], built, layers.length)[0];
      const sector = sectorCoverage(built, [summary], centre, aswReq)[0];
      const minLeg = minimumLegArea({ fck, fyk, sr, st: summary.tangential.max });
      if (summary.tangential.max <= stLimit + 1e-9 && summary.asw >= aswReq - 1e-9 && sector.ur <= 1 + 1e-9 && barArea(diameter) >= minLeg - 1e-9) found = layer;
    }
    if (!found) return { layers: [], reason: `No valid link count for layer L${i + 1} on the head outline.` };
    layers.push(found);
  }
  return { layers };
}

// circle: calculate() result on the equivalent circle (noLinks); rectModel: model of the head outline.
export function mappedHeadLinks({ circle, rectModel, input, rc, lHalfMin, layers: provided }) {
  const d = circle.section.d;
  const { materials, reinforcement } = input;
  const centre = { x: input.column.x, y: input.column.y };
  const rEq = rc.r - 2 * d; // equivalent loaded-area radius
  const aswReq = circle.envelope.aswReq;
  // Offset from the head outline of the point of u_out,ef nearest to the head (mid-side, short side).
  const tOut = circle.envelope.aOut > 0 ? rEq + circle.envelope.aOut - lHalfMin : 0;
  const required = circle.loads.some(load => load.required);
  let layout;
  if (!required) layout = { layers: [], reason: 'No punching reinforcement required.' };
  else if (reinforcement.mode === 'auto') layout = autoMapped({ model: rectModel, d, aswReq, tOut, fck: materials.fck, fyk: materials.fyk, diameter: reinforcement.diameter, shape: reinforcement.shape, centre });
  else layout = { layers: provided.map(layer => ({ omitted: [], ...layer })) };
  const links = buildLinks(rectModel, layout.layers, reinforcement.mode === 'auto' ? 'auto' : 'user');
  const summary = layerSummary(rectModel, layout.layers, links);
  layout.layers = layout.layers.map((layer, i) => ({ ...layer, id: summary[i].id }));
  const detailing = layout.layers.length ? detailingChecks({ slab: input.slab, anchorage: reinforcement.anchorage, diameters: layout.layers.map(layer => layer.diameter) }) : null;
  const sectors = sectorCoverage(links, summary, centre, aswReq);
  const worstSector = sectors.reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
  const note = 'Mapped from the head outline to the EC2 equivalent circle (proposed method, see Help).';
  const loads = circle.loads.map(load => {
    if (!load.required) return load;
    const rows = load.rows.filter(entry => entry.id !== 'concrete');
    rows.push(row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at r_cont (links required)', load.vEd1, circle.resistance.vRdc, STATES.linksRequired, { unit: 'MPa' }));
    let layoutCheck = null;
    if (!layout.layers.length) rows.push(row('reinforced', '§6.4.5, Eq. 6.52', 'Reinforced punching resistance at r_cont', load.vEd1, 0.75 * circle.resistance.vRdc, STATES.fail, { unit: 'MPa', detail: layout.reason || 'No links provided.' }));
    else {
      layoutCheck = checkLayout({ d, fck: materials.fck, fyk: materials.fyk, vRdc: circle.resistance.vRdc, vEd: load.vEd1, u1: circle.u1, aOut: tOut, summary, links, kMax: circle.profile.kMax, kMaxLabel: circle.profile.kMaxLabel, detailing });
      for (const entry of layoutCheck.rows) rows.push(MAPPED.has(entry.id) ? { ...entry, detail: [entry.detail, note].filter(Boolean).join(' ') } : entry);
      const share = load.aswReq / SECTORS;
      const sectorRow = sectorCoverage(links, summary, centre, load.aswReq).reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
      rows.push(row('sector', 'Mapping (not EC2)', `A_sw per ${360 / SECTORS}° sector ≥ A_sw,req/${SECTORS}`, share, sectorRow.min, sectorRow.ur > 1 + 1e-9 ? STATES.fail : STATES.pass, {
        unit: 'mm²', governing: sectorRow.id, detail: `${sectorRow.id}, sector ${sectorRow.sector + 1}: ${sectorRow.min.toFixed(0)} mm² against ${share.toFixed(0)} mm². ${note}`,
      }));
    }
    const counted = rows.filter(entry => entry.ur !== null && Number.isFinite(entry.ur) && entry.status !== STATES.linksRequired && entry.unit !== 'layers');
    const states = rows.map(entry => entry.status);
    const status = [STATES.fail, STATES.notVerified, STATES.confirm].find(state => states.includes(state)) ?? STATES.pass;
    return { ...load, rows, status, ur: Math.max(0, ...counted.map(entry => entry.ur)), layoutCheck: null, ext: { layoutCheck } };
  });
  return { loads, layout: { mode: reinforcement.mode, reason: layout.reason ?? null, layers: layout.layers, links, summary }, worstSector, detailing, tOut };
}
