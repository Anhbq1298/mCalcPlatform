// Inner section of a rectangular head that straddles l_H = 2h_H (internal column, Fig. 6.18).
// Physics: the punching crack rises at θ = arctan(1/2) from the column face. On a face with l_H ≥ 2h_H it
// crosses the full d_H inside the head and reaches the top at 2d_H (inner section with d_H). On a face
// with l_H < 2h_H it would leave through the side of the head before crossing h_H, so there the head acts
// with the column and the crack starts at the head edge through the slab d (2d from the head outline).
// The inner section is therefore composite (tool method, see Help):
//   long faces (l_H ≥ 2h_H): straight parts of length = column face, at 2d_H from the face, with d_H;
//   the rest (short faces and corners): the slab section at 2d from the head outline, with d.
// Check: β·V_Ed ≤ Σ v_R,i·u_i·d_i, reported as v_Ed = βV/Σ(u_i·d_i) against the d-weighted resistance.
// Concrete only first (v_R = v_Rd,c of each part). If that fails, links: each part takes the resistance
// of its own section with links (v_Rd,cs of the section inside the drop, Eq. 6.52 with d_H, for the long
// parts; of the slab section around the drop for the rest). Both sections are designed for the loads
// scaled up step by step until the composite passes; their own checks use the actual loads.
import { worstState } from './calculate.mjs';
import { STATES } from './inputs.mjs';
import { row } from './reinforcement-checks.mjs';

const FACE = { xMax: 'cy', xMin: 'cy', yMax: 'cx', yMin: 'cx' }; // column face length per head side
const SIDE = { xMax: 'y', xMin: 'y', yMax: 'x', yMin: 'x' }; // head side length direction
const STEPS = [1, 1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5];

// Resistance of one section per unit length: v_Rd,c, or with links v_Rd,cs (Eq. 6.52, ≤ k_max·v_Rd,c).
// v_Rd,cs depends on the link layout only, so it is read from the run designed for the scaled loads,
// where every section needs links and the rows are present.
const resistance = (load, links) => {
  const rows = load?.rows ?? [];
  const find = id => rows.find(entry => entry.id === id);
  if (links && find('reinforced')?.resistance > 0) return { v: Math.min(find('reinforced').resistance, find('kmax')?.resistance ?? Infinity), links: true };
  return { v: find('concrete')?.resistance, links: false };
};

function parts({ inner, outer, input, geo, d, dH, whole }) {
  // Whole inner section with d_H (2d_H beyond the head, every face long): the composite has no slab part.
  if (whole) return { uLong: inner.u1, uRest: 0, sumUd: inner.u1 * dH, long: [], whole: true };
  const e = geo.extents;
  const dropSide = { x: e.xMax - e.xMin, y: e.yMax - e.yMin };
  const long = Object.keys(FACE).filter(side => geo.lSides[side] >= 2 * geo.hH - 1e-9);
  const uLong = long.reduce((sum, side) => sum + input.column[FACE[side]], 0);
  const uRest = outer.u1 - long.reduce((sum, side) => sum + dropSide[SIDE[side]], 0);
  return { uLong, uRest, sumUd: uLong * dH + uRest * d, long };
}

// Per load: composite stress (actual loads) and resistance from the two sections (designed runs).
// A section that could not be designed for the scaled loads keeps its concrete resistance (fallback run).
function evaluate({ demand, inner, outer, d, dH, p, links, fallback = {} }) {
  return demand.loads.map((load, i) => {
    const pick = (run, back) => (run?.loads?.[i] ? { load: run.loads[i], links: links && run.layout?.layers.length > 0 } : { load: back?.loads?.[i], links: links && back?.layout?.layers.length > 0 });
    const a = pick(inner, fallback.inner);
    const b = pick(outer, fallback.outer);
    let rIn = resistance(a.load, a.links);
    const rOut = resistance(b.load, b.links);
    if (!(rIn.v > 0) || !(rOut.v > 0)) return null;
    // No links inside the head: the slab links around it (within 2d_H of the column) cross the inner crack.
    // Their steel term of Eq. 6.52, 1.5·A_sw·f_ywd,ef/(s_r·u), is a density per unit length of perimeter and
    // carries over; the concrete term is that of d_H; capped at k_max·v_Rd,c(d_H) with the outer k_max factor.
    if (links && !rIn.links && rOut.links) {
      const cIn = resistance(a.load, false).v;
      const cOut = resistance(b.load, false).v;
      const kFactor = (b.load.rows.find(entry => entry.id === 'kmax')?.resistance ?? Infinity) / cOut;
      rIn = { v: Math.min(0.75 * cIn + (rOut.v - 0.75 * cOut), kFactor * cIn), links: true, fromSlab: true };
    }
    const vEd = ((load.beta?.value ?? 1) * load.V * 1e3) / p.sumUd;
    const vRd = (rIn.v * p.uLong * dH + rOut.v * p.uRest * d) / p.sumUd;
    return { vEd, vRd, ok: vEd <= vRd + 1e-9, rIn, rOut };
  });
}

function patch({ inner, geo, d, dH, p, results, links, plain = null }) {
  inner.compositeSection = p.whole ? null : { uLong: p.uLong, uRest: p.uRest, d, dH, long: p.long };
  inner.loads.forEach((load, i) => {
    const r = results[i];
    let k = load.rows.findIndex(entry => entry.id === (links ? 'reinforced' : 'concrete'));
    if (!r) return;
    if (links && !r.ok && plain?.[i] && r.vRd < plain[i].vRd) Object.assign(r, plain[i]);
    if (k < 0) { load.rows.push(null); k = load.rows.length - 1; }
    const what = side => (side.links ? 'v_Rd,cs' : 'v_Rd,c');
    const slabLinks = r.rIn.fromSlab ? ' (links of the slab section around the head, within 2d_H of the column: they cross this crack)' : '';
    const detail = p.whole
      ? `Section inside the head at 2d_H with d_H = ${dH.toFixed(1)} mm; 2d_H reaches beyond the head, so its crack ends in the slab: ${what(r.rIn)} = ${r.rIn.v.toFixed(3)} MPa${slabLinks} (tool method, see Help).`
      : `Composite inner section (tool method, see Help): ${p.uLong.toFixed(0)} mm at 2d_H from the faces with l_H ≥ 2h_H, d_H = ${dH.toFixed(1)} mm, ${what(r.rIn)} = ${r.rIn.v.toFixed(3)} MPa${slabLinks}; ${p.uRest.toFixed(0)} mm at 2d from the head outline, d = ${d.toFixed(1)} mm, ${what(r.rOut)} = ${r.rOut.v.toFixed(3)} MPa. β·V_Ed ≤ Σ v_R·u·d.`;
    const fix = ` Not enough even with links designed for up to ${STEPS.at(-1)}× the loads: extend the head to l_H ≥ 2h_H = ${(2 * geo.hH).toFixed(0)} mm on every face, or thicken the slab or head.`;
    load.rows[k] = row(links ? 'reinforced' : 'concrete', `§6.4.2(9), Fig. 6.18 (composite, tool method)${links ? ', Eq. 6.52' : ''}`,
      p.whole ? `Inside the drop (d_H)${links ? ': links of the slab section within 2d_H' : ''}` : `Inside the drop: composite section${links ? ' with links' : ''} (d_H where l_H ≥ 2h_H, d elsewhere)`, r.vEd, r.vRd, r.ok ? STATES.pass : STATES.fail,
      { unit: 'MPa', detail: r.ok ? detail : detail + fix });
    const c = load.rows.findIndex(entry => entry.id === 'concrete');
    if (links && c >= 0 && plain?.[i]) {
      load.rows[c] = row('concrete', '§6.4.2(9), Fig. 6.18', p.whole ? 'Inside the drop (d_H): concrete punching resistance (links required)' : 'Inside the drop: composite section, concrete (links required)', plain[i].vEd, plain[i].vRd, STATES.linksRequired, { unit: 'MPa', detail: 'v_Ed > Σ v_Rd,c·u·d / Σ u·d: links provide the resistance (see Help).' });
    }
    if (links) load.rows = load.rows.filter(entry => entry.id !== 'outer'); // coverage: the slab section around the head
    load.required = links;
    load.ur = Math.max(0, ...load.rows.filter(entry => Number.isFinite(entry.ur)).map(entry => entry.ur));
    load.status = worstState(load.rows.map(entry => entry.status));
  });
}

export function compositeInner({ inner, outer, input, geo, d, dH, runInner, runOuter, provided, linkLimit = Infinity, whole = false }) {
  const p = parts({ inner, outer, input, geo, d, dH, whole });
  const plain = evaluate({ demand: inner, inner, outer, d, dH, p, links: false });
  const linksOn = input.reinforcement.enabled !== false;
  if (plain.every(r => !r || r.ok) || !linksOn || provided) {
    patch({ inner, geo, d, dH, p, results: plain, links: false });
    return { inner, outer };
  }
  // Design both sections for scaled loads; check them (and the composite) with the actual loads.
  const start = Math.max(1, ...plain.filter(Boolean).map(r => r.vEd / r.vRd));
  let last = null;
  for (const step of STEPS) {
    const scale = start * step;
    const innerB = runInner(scale);
    const outerB = runOuter(scale, null, innerB.layout?.layers.length ?? 0, { compactOuterZone: Boolean(outer.compactOuterZone) });
    // Links inside the head stay within the head on every face (l_H,min − c); on the long faces the slab
    // links of the outer section continue beyond. v_Rd,cs (Eq. 6.52) depends on A_sw per perimeter and s_r,
    // not on the number of perimeters, so the truncated layout keeps the resistance used here.
    // §9.4.3 needs at least two perimeters; fewer inside the head means no links there (concrete only).
    const within = (innerB.layout?.layers ?? []).filter(layer => layer.offset <= linkLimit + 1e-9);
    const kept = within.length >= 2 ? within : [];
    const nIn = kept.length;
    const innerF = nIn ? runInner(1, kept) : runInner(1, null);
    const outerF = outerB.layout?.layers.length ? runOuter(1, outerB.layout.layers, nIn, { compactOuterZone: Boolean(outer.compactOuterZone) }) : outer;
    if (!innerF.loads?.length || !outerF.loads?.length) continue;
    const results = evaluate({ demand: innerF, inner: nIn ? innerB : null, outer: outerB, d, dH, p, links: true, fallback: { inner, outer } });
    last = { inner: innerF, outer: outerF, results };
    if (results.every(r => !r || r.ok) && outerF.status !== STATES.fail) break;
  }
  if (!last) { patch({ inner, geo, d, dH, p, results: plain, links: false }); return { inner, outer }; }
  patch({ inner: last.inner, geo, d, dH, p, results: last.results, links: true, plain });
  return { inner: last.inner, outer: last.outer };
}
