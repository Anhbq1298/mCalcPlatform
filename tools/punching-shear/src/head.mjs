// Drop panels and enlarged column heads, EN 1992-1-1 §6.4.2(8)–(11), Figs. 6.17 and 6.18.
// Each control section is solved as an ordinary internal-column check by calculate() with a modified
// loaded area or depth; the results are merged so that the worst section governs.
//   l_H < 2h_H: one section in the slab at r_cont (Eq. 6.33 circular, Eq. 6.34/6.35 rectangular).
//   l_H > 2h_H: a section in the slab at 2d from the head edge (the head is the loaded area) and,
//               when it fits inside the head (2d_H ≤ l_H), a section at 2d_H from the column face with
//               d_H = d + h_H. Eq. 6.36/6.37 state this for circular columns; rectangular heads use the
//               same geometric construction (as Tekla Structural Designer documents). Method notes for
//               users are in help.html, not in the UI.
// Edge and corner columns: the drop is clipped to the slab outline (it is flush with the free edges
// the column is flush with). The slab section takes the clipped drop as an edge or corner loaded area
// (Fig. 6.15/6.20 perimeters), the inner section is the edge or corner column with d_H. EN 1992-1-1
// shows heads only at internal columns, so this is a geometric interpretation (see help.html).
import { calculate, worstState } from './calculate.mjs';
import { perimeterAtOffset } from './geometry.mjs';
import { STATES, derivedSection, restoreInputs } from './inputs.mjs';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

const SIDES = ['xMax', 'xMin', 'yMax', 'yMin'];

// Drop outline in column-local coordinates, clipped to the slab for unrotated columns; `free` marks
// sides where the drop reaches the slab edge.
export function headExtents(input) {
  const { column, head, slab } = input;
  if (head.shape === 'circular') {
    const r = head.diameter / 2;
    return { xMin: -r, xMax: r, yMin: -r, yMax: r, free: {} };
  }
  const e = { xMin: -head.lx / 2, xMax: head.lx / 2, yMin: -head.ly / 2, yMax: head.ly / 2, free: {} };
  if (column.rotation) return e;
  const limit = { xMin: slab.xMin - column.x, xMax: slab.xMax - column.x, yMin: slab.yMin - column.y, yMax: slab.yMax - column.y };
  for (const side of SIDES) {
    const beyond = side.endsWith('Max') ? e[side] >= limit[side] - 1 : e[side] <= limit[side] + 1;
    if (beyond) { e[side] = limit[side]; e.free[side] = true; }
  }
  return e;
}

// Clear distances l_H from the column face to the drop edge on each side that is not a free edge,
// and the case for those sides.
export function headGeometry(input) {
  const { column, head } = input;
  const circular = column.shape === 'circular';
  const hH = head.depth;
  const extents = headExtents(input);
  const half = circular ? { x: column.diameter / 2, y: column.diameter / 2 } : { x: column.cx / 2, y: column.cy / 2 };
  const sides = {};
  for (const side of SIDES) sides[side] = Math.abs(extents[side]) - (side.startsWith('x') ? half.x : half.y);
  const interior = SIDES.filter(side => !extents.free[side]);
  const lH = circular ? [(head.diameter - column.diameter) / 2] : interior.map(side => sides[side]);
  const below = lH.every(value => value <= 2 * hH + 1e-9);
  const above = lH.every(value => value > 2 * hH + 1e-9);
  return { circular, lH, lSides: sides, extents, lMin: Math.min(...lH), hH, kind: below ? 'small' : above ? 'large' : 'mixed' };
}

// r_cont from the column centroid for l_H < 2h_H (Eq. 6.33–6.35). l1 ≤ l2 are the overall head sizes.
export function rcontSmall(input, d) {
  const { column, head } = input;
  if (column.shape === 'circular') return { r: 2 * d + (head.diameter - column.diameter) / 2 + 0.5 * column.diameter, eq: 'Eq. 6.33' };
  const l1 = Math.min(head.lx, head.ly);
  const l2 = Math.max(head.lx, head.ly);
  const a = 2 * d + 0.56 * Math.sqrt(l1 * l2);
  const b = 2 * d + 0.69 * l1;
  return a <= b ? { r: a, eq: 'Eq. 6.34', l1, l2, alt: b } : { r: b, eq: 'Eq. 6.35', l1, l2, alt: a };
}

function validateHead(input, base) {
  const { head, column } = input;
  const issues = [];
  const shapeOk = (column.shape === 'circular') === (head.shape === 'circular');
  if (!shapeOk) issues.push({ state: STATES.unsupportedGeometry, message: 'Use a circular head with a circular column and a rectangular head with a rectangular column (Figs. 6.17 and 6.18).' });
  const sizes = head.shape === 'circular' ? [head.diameter] : [head.lx, head.ly];
  if (![...sizes, head.depth].every(positive)) issues.push({ state: STATES.incomplete, message: 'Enter the drop size and its depth below the slab.' });
  if (issues.length) return issues;
  const geo = headGeometry(input);
  if (geo.lH.some(value => value <= 0)) issues.push({ state: STATES.incomplete, message: 'The drop must be larger than the column on every side that faces the slab.' });
  const kind = base.position?.kind;
  const freeSides = Object.keys(geo.extents.free);
  if (kind && kind !== 'internal') {
    if (column.shape === 'circular') issues.push({ state: STATES.unsupportedGeometry, message: 'Drops at edge or corner columns are implemented for rectangular columns only.' });
    if (column.rotation) issues.push({ state: STATES.unsupportedGeometry, message: 'Drops at edge or corner columns need an unrotated column (faces parallel to the slab edges).' });
  }
  const flush = side => Math.abs(geo.lSides[side]) <= 1;
  if (freeSides.some(side => !flush(side))) issues.push({ state: STATES.unsupportedGeometry, message: 'The drop reaches a slab edge that the column is not flush with. Not covered.' });
  if ((input.openings || []).length) issues.push({ state: STATES.unsupportedGeometry, message: 'Openings combined with a drop are not implemented.' });
  return issues;
}

const deeper = (input, hH) => {
  const { dx, dy } = derivedSection(input);
  return { ...input, slab: { ...input.slab, h: input.slab.h + hH, depthMode: 'explicit', dx: dx + hH, dy: dy + hH } };
};
const asColumn = (input, size) => ({ ...input, column: { ...input.column, ...size }, openings: [], reinforcement: { ...input.reinforcement, mode: 'auto', layers: [] } });

function merge(primary, extra, headIssues, headInfo, input) {
  const loads = primary.loads.map((load, index) => {
    const other = extra?.loads[index];
    if (!other) return load;
    const rows = [...load.rows, ...other.rows.map(entry => ({ ...entry, id: 'ext-' + entry.id }))];
    return { ...load, rows, status: worstState([load.status, other.status]), ur: Math.max(load.ur, other.ur), ext: other };
  });
  const governing = loads.reduce((best, entry) => (entry.ur > best.ur ? entry : best), loads[0]);
  const all = [...(primary.issues || []), ...(extra?.issues || []), ...headIssues];
  const issues = all.filter((item, index) => all.findIndex(other => other.message === item.message) === index);
  const notes = [...(primary.notes || []), ...(extra?.notes || []).filter(note => !(primary.notes || []).includes(note))];
  const informational = [STATES.notRequired, STATES.linksRequired];
  const rowsOf = governing?.rows.filter(entry => entry.ur !== null && Number.isFinite(entry.ur) && !informational.includes(entry.status)) ?? [];
  const governingRow = rowsOf.reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
  return {
    ...primary, loads, issues, notes, input, checkInput: primary.input, head: headInfo,
    status: worstState([...loads.map(entry => entry.status), ...issues.map(entry => entry.state)]),
    governing: governing ? { load: governing.name, check: governingRow?.label ?? null, ur: governing.ur } : primary.governing,
  };
}

export function calculateDesign(raw) {
  const input = restoreInputs(raw);
  if (!input.head?.enabled) return calculate(input);
  const base = calculate({ ...input, head: { ...input.head, enabled: false } });
  if (!base.section) return { ...base, input };
  const blocking = validateHead(input, base);
  if (blocking.length) return { status: worstState(blocking.map(item => item.state)), issues: blocking, notes: [], profile: base.profile, loads: [], input };

  const d = base.section.d;
  const geo = headGeometry(input);
  const momentBeta = input.beta.method === 'moment'
    ? [{ state: STATES.confirm, message: 'β from moments with a drop uses the column (inside) or the drop (outside) as the loaded area in Eq. 6.39/6.42; EN 1992-1-1 gives no W1 for column heads.' }]
    : [];
  if (geo.kind === 'mixed') {
    return { status: STATES.unsupportedGeometry, issues: [{ state: STATES.unsupportedGeometry, message: `l_H = ${geo.lH.map(v => v.toFixed(0)).join(' / ')} mm straddles 2h_H = ${(2 * geo.hH).toFixed(0)} mm: one direction falls under Fig. 6.17 and the other under Fig. 6.18. Not covered.` }], notes: [], profile: base.profile, loads: [], input };
  }
  const internal = (base.position?.kind ?? 'internal') === 'internal';
  const e = geo.extents;
  const dropAsColumn = geo.circular ? { diameter: input.head.diameter }
    : { cx: e.xMax - e.xMin, cy: e.yMax - e.yMin, x: input.column.x + (e.xMax + e.xMin) / 2, y: input.column.y + (e.yMax + e.yMin) / 2 };
  if (geo.kind === 'small' && !internal) {
    // Edge/corner: slab section around the clipped drop at 2d (Eq. 6.34/6.35 are for internal columns).
    const face = { u0: base.u0, d, label: 'Maximum punching stress at u0 (slab d, conservative)' };
    const result = calculate(asColumn(input, dropAsColumn), { face, label: 'Slab outside the drop at 2d', noLinks: 'v_Ed > v_Rd,c outside the drop. Links outside the drop are not implemented; enlarge the drop or the slab depth.' });
    const info = { kind: 'small', edge: true, ...geo, d, rcont: null, sections: [{ id: 'ext', label: 'Slab outside the drop', d, offset: 2 * d, model: result.model, u1: result.u1, eq: 'Fig. 6.15 (interpretation)' }] };
    if (!result.loads?.length) return { ...result, input, head: info };
    return merge(result, null, momentBeta, info, input);
  }
  if (geo.kind === 'small') {
    const rc = rcontSmall(input, d);
    const sub = asColumn(input, { shape: 'circular', diameter: 2 * (rc.r - 2 * d), rotation: 0 });
    const face = { u0: perimeterAtOffset(input.column, 0), d, label: 'Maximum punching stress at the column face (slab d, conservative)', detail: 'u0 = column perimeter; d of the slab ignores the head depth.' };
    const result = calculate(sub, { face, label: `Slab at r_cont (${rc.eq})`, noLinks: 'v_Ed > v_Rd,c outside the head. Links outside a column head with l_H ≤ 2h_H are not implemented; enlarge the head or the slab depth.' });
    const info = { kind: 'small', ...geo, d, rcont: rc, sections: [{ id: 'ext', label: 'Slab outside the head', d, offset: 2 * d, model: result.model, u1: result.u1, eq: rc.eq }] };
    if (!result.loads?.length) return { ...result, input, head: info };
    return merge(result, null, momentBeta, info, input);
  }
  const dH = d + geo.hH;
  const inside = 2 * dH <= geo.lMin + 1e-9; // the inner control perimeter fits inside the head
  const size = dropAsColumn;
  const noLinksOutside = 'v_Ed > v_Rd,c in the slab outside the drop. Links outside the drop are not implemented; enlarge the drop or the slab depth.';
  const extSection = outer => ({ id: 'ext', label: 'Slab outside the drop', d, offset: 2 * d, model: outer.model, u1: outer.u1, eq: geo.circular ? 'Eq. 6.36' : internal ? '§6.4.2(9)' : 'Fig. 6.15 (interpretation)' });
  if (!inside) {
    // Only the slab section; the face check uses the column perimeter with d_H (§6.4.2(10)).
    const face = { u0: base.u0, d: dH, label: 'Maximum punching stress at u0 (d_H)' };
    const outer = calculate(asColumn(input, size), { face, label: 'Slab outside the drop at u1,ext', noLinks: noLinksOutside });
    const info = { kind: 'large', inner: false, edge: !internal, ...geo, d, dH, sections: [extSection(outer)] };
    if (!outer.loads?.length) return { ...outer, input, head: info };
    return merge(outer, null, momentBeta, info, input);
  }
  const inner = calculate(deeper(input, geo.hH), { u1Offset: 2 * dH, linkLimit: geo.lMin - input.slab.cover, label: 'Inside the drop (d_H)' });
  const outer = calculate(asColumn(input, size), { face: { skip: true }, label: 'Slab outside the drop at u1,ext', noLinks: noLinksOutside });
  const info = {
    kind: 'large', inner: true, edge: !internal, ...geo, d, dH,
    sections: [{ id: 'int', label: 'Inside the drop', d: dH, offset: 2 * dH, model: inner.model, u1: inner.u1, eq: geo.circular ? 'Eq. 6.37' : '§6.4.2(10)' }, extSection(outer)],
  };
  if (!inner.loads?.length) return { ...inner, input, head: info };
  if (!outer.loads?.length) return { ...outer, input, head: info, status: worstState([outer.status, inner.status]) };
  return merge(inner, outer, momentBeta, info, input);
}
