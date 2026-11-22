// Drop panels and enlarged column heads, EN 1992-1-1 §6.4.2(8)–(11), Figs. 6.17 and 6.18.
// Each control section is solved as an ordinary check by calculate() with a modified loaded area or
// depth; the results are merged so that the worst section governs. Links may sit inside the drop (d_H,
// around the column) and beyond it (d, around the drop as the loaded area).
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
import { mappedHeadLinks } from './head-mapped.mjs';
import { STATES, derivedSection, groupLayers, restoreInputs } from './inputs.mjs';

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
  const hH = head.thickness - input.slab.h;
  const extents = headExtents(input);
  const half = circular ? { x: column.diameter / 2, y: column.diameter / 2 } : { x: column.cx / 2, y: column.cy / 2 };
  const sides = {};
  for (const side of SIDES) sides[side] = Math.abs(extents[side]) - (side.startsWith('x') ? half.x : half.y);
  const interior = SIDES.filter(side => !extents.free[side]);
  const lH = circular ? [(head.diameter - column.diameter) / 2] : interior.map(side => sides[side]);
  // Fig. 6.17 (§6.4.2(8)) applies when the head lies within l_H < 2h_H on every side; otherwise Fig. 6.18
  // (l_H ≥ 2h_H, AC2). A rectangular head with some sides below and some at or beyond 2h_H is therefore
  // checked by Fig. 6.18: sections inside the head with d_H and in the slab at 2d from the head outline.
  const below = lH.every(value => value < 2 * hH - 1e-9);
  return { circular, lH, lSides: sides, extents, lMin: Math.min(...lH), hH, kind: below ? 'small' : 'large', straddles: !below && lH.some(value => value < 2 * hH - 1e-9) };
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
  if (!sizes.every(positive) || !positive(head.thickness)) issues.push({ state: STATES.incomplete, message: 'Enter the drop size and its total thickness h_tot.' });
  else if (head.thickness <= input.slab.h) issues.push({ state: STATES.incomplete, message: 'The drop thickness h_tot must exceed the slab thickness h.' });
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
const asColumn = (input, size) => ({ ...input, column: { ...input.column, ...size }, openings: [] });

// Hint: the smallest drop (same depth, both plan sizes grown by the same amount, in 50 mm steps) for which
// the slab around it needs no links, with the β cap of the column connection. Null when it already needs
// none or no size within 20 m does. Bisection on the plan growth; each step is one unreinforced check.
function dropForNoLinks(input, betaCap) {
  const grown = delta => ({ ...input, head: { ...input.head, sizeMode: 'absolute', lx: input.head.lx + delta, ly: input.head.ly + delta, diameter: input.head.diameter + delta } });
  const needs = delta => {
    const inp = grown(delta);
    const geo = headGeometry(inp);
    const e = geo.extents;
    const size = geo.circular ? { diameter: inp.head.diameter }
      : { cx: e.xMax - e.xMin, cy: e.yMax - e.yMin, x: inp.column.x + (e.xMax + e.xMin) / 2, y: inp.column.y + (e.yMax + e.yMin) / 2 };
    const r = calculate(asColumn({ ...inp, reinforcement: { ...inp.reinforcement, enabled: false } }, size), { betaCap, face: { skip: true } });
    return !r.loads?.length || r.loads.some(load => load.required);
  };
  if (!needs(0)) return null;
  let lo = 0;
  let hi = 200;
  while (needs(hi)) { lo = hi; hi *= 2; if (hi > 20000) return null; }
  while (hi - lo > 50) { const mid = Math.round((lo + hi) / 100) * 50; if (mid <= lo || mid >= hi) break; if (needs(mid)) lo = mid; else hi = mid; }
  const head = grown(hi).head;
  const size = head.shape === 'circular' ? `Ø${head.diameter.toFixed(0)}` : `${head.lx.toFixed(0)} × ${head.ly.toFixed(0)}`;
  return input.head.sizeMode === 'column' ? `l_H = ${(input.head.offset + hi / 2).toFixed(0)} mm (${size})` : `${size} mm`;
}

// Provided layers by zone, s = distance from the column face. Inside the drop (s ≤ l_H,min − c) they
// belong to the section with d_H around the column; beyond the drop edge (s > l_H,min) they follow the
// drop outline at t = s − l_H,min and belong to the slab section around the drop. Layers on the step
// between the two are rejected. Method note in help.html.
function splitLayers(input, geo, dropChecked) {
  const cover = input.slab.cover;
  const out = { drop: [], slab: [], issues: [], notes: [] };
  for (const layer of groupLayers(input.reinforcement)) {
    const s = layer.offset.toFixed(0);
    if (layer.offset <= geo.lMin - cover + 1e-9) {
      if (dropChecked) out.drop.push(layer);
      else out.notes.push(`${layer.id} (s = ${s} mm) lies inside the drop, where no control section is checked; it is not counted.`);
    } else if (layer.offset <= geo.lMin + 1e-9) {
      out.issues.push({ state: STATES.fail, message: `${layer.id} (s = ${s} mm) lies on the drop edge step: keep links within l_H,min − c = ${(geo.lMin - cover).toFixed(0)} mm or beyond l_H,min = ${geo.lMin.toFixed(0)} mm.` });
    } else out.slab.push({ ...layer, offset: layer.offset - geo.lMin });
  }
  return out;
}

const EMPTY = { layers: [], links: [], summary: [], reason: null };

// One layout for drawings and the schedule. Offsets are from the column face; slab layers keep their
// offset from the drop edge as pathOffset.
function combinedLayout(inner, outer, lMin) {
  const a = inner?.layout ?? EMPTY;
  const b = outer?.layout ?? EMPTY;
  const drop = item => ({ ...item, zone: 'drop', pathOffset: item.offset });
  const slab = item => ({ ...item, zone: 'slab', pathOffset: item.offset, offset: item.offset + lMin });
  return {
    mode: a.mode ?? b.mode,
    reason: a.layers.length || b.layers.length ? null : b.reason ?? a.reason,
    layers: [...a.layers.map(drop), ...b.layers.map(slab)],
    links: [...a.links.map(link => ({ ...link, zone: 'drop' })), ...b.links.map(link => ({ ...link, zone: 'slab' }))],
    summary: [...a.summary.map(drop), ...b.summary.map(slab)],
  };
}

function merge(primary, extra, headIssues, headInfo, input, layout, headNotes = []) {
  const loads = primary.loads.map((load, index) => {
    const other = extra?.loads[index];
    if (!other) return load;
    // Slab-section rows get an unambiguous label so the governing check names the right section.
    const rows = [...load.rows, ...other.rows.map(entry => ({ ...entry, id: 'ext-' + entry.id, label: /outside the drop/i.test(entry.label) ? entry.label : 'Outside the drop: ' + entry.label }))];
    return { ...load, rows, status: worstState([load.status, other.status]), ur: Math.max(load.ur, other.ur), ext: other };
  });
  const governing = loads.reduce((best, entry) => (entry.ur > best.ur ? entry : best), loads[0]);
  const all = [...(primary.issues || []), ...(extra?.issues || []), ...headIssues];
  const issues = all.filter((item, index) => all.findIndex(other => other.message === item.message) === index);
  const notes = [...(primary.notes || []), ...(extra?.notes || []).filter(note => !(primary.notes || []).includes(note)), ...headNotes];
  const informational = [STATES.notRequired, STATES.linksRequired];
  // Count checks (unit 'layers') are not utilisations and never govern, as in calculate().
  const rowsOf = governing?.rows.filter(entry => entry.ur !== null && Number.isFinite(entry.ur) && !informational.includes(entry.status) && entry.unit !== 'layers') ?? [];
  const governingRow = rowsOf.reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
  return {
    ...primary, loads, issues, notes, input, checkInput: primary.input, head: headInfo, layout,
    status: worstState([primary.loads.length ? null : primary.status, extra?.loads.length ? null : extra?.status, ...loads.map(entry => entry.status), ...issues.map(entry => entry.state)]),
    methods: [
      ...new Set([...(primary.methods ?? []), ...(extra?.methods ?? [])]),
      ...(headInfo.mapped && layout.layers.length ? ['Rectangular head: 16-sector mapping to the equivalent circle'] : []),
      ...(headInfo.edge || (headInfo.kind === 'large' && !headInfo.circular) ? ['Rectangular drop: offset perimeters'] : []),
    ],
    governing: governing ? { load: governing.name, loadId: governing.id, check: governingRow?.label ?? null, ur: governing.ur } : primary.governing,
  };
}

export function calculateDesign(raw, forcedKind = null) {
  const input = restoreInputs(raw);
  if (!input.head?.enabled) return calculate(input);
  const base = calculate({ ...input, head: { ...input.head, enabled: false } });
  if (!base.section) return { ...base, input };
  const blocking = validateHead(input, base);
  if (blocking.length) return { status: worstState(blocking.map(item => item.state)), issues: blocking, notes: [], profile: base.profile, loads: [], input };

  const d = base.section.d;
  // β around the drop is capped at the column connection's β (calculate.mjs capBeta, see Help).
  const betaCap = new Map((base.loads ?? []).map(load => [load.name, load.beta?.value]));
  const geo0 = headGeometry(input);
  const geo = forcedKind ? { ...geo0, kind: forcedKind } : geo0;
  // β from moments with a drop: column (inside) or drop (outside) as the loaded area, see Help.
  const momentBeta = [];
  const internal = (base.position?.kind ?? 'internal') === 'internal';
  const e = geo.extents;
  const dropAsColumn = geo.circular ? { diameter: input.head.diameter }
    : { cx: e.xMax - e.xMin, cy: e.yMax - e.yMin, x: input.column.x + (e.xMax + e.xMin) / 2, y: input.column.y + (e.yMax + e.yMin) / 2 };
  const dH = d + geo.hH;
  const inside = geo.kind === 'large' && 2 * dH <= geo.lMin + 1e-9; // the inner control perimeter fits inside the head
  const provided = input.reinforcement.enabled !== false && input.reinforcement.mode === 'provided';
  const split = provided ? splitLayers(input, geo, inside) : { drop: [], slab: [], issues: [], notes: [] };
  if (geo.straddles && !forcedKind) {
    split.notes.push(`l_H = ${geo.lH.map(v => v.toFixed(0)).join(' / ')} mm: not every side has l_H < 2h_H = ${(2 * geo.hH).toFixed(0)} mm, so Fig. 6.18 applies (§6.4.2(8)–(9)); on the sides with l_H < 2h_H the section inside the head uses d_H as drawn in Fig. 6.18 (see Help).`);
  }
  if (input.beta.method === 'moment') split.notes.push('β from moments with a drop uses the column (inside) or the drop (outside) as the loaded area (Eq. 6.39/6.42), see Help.');
  const zone = (layers, layerBase) => (provided ? { layers } : { layerBase });
  // Links needed around the drop: say how large a drop (same depth) would need none there.
  const hint = outer => {
    if (!outer.loads?.some(load => load.required) || input.head.shape === 'circular' && !(input.head.diameter > 0)) return;
    const size = dropForNoLinks(input, betaCap);
    if (size) split.notes.push(`Links are needed in the slab around the drop. A drop of ${size} (same depth) would need none there (β of the column connection; inside the drop unchanged).`);
  };
  const issuesOf = [...momentBeta, ...split.issues];
  const extSection = (outer, eq, offset = 2 * d) => ({ id: 'ext', label: 'Slab outside the drop', d, offset, model: outer.model, u1: outer.u1, eq, aOut: outer.envelope?.uOut ? outer.envelope.aOut : 0 });
  const single = (outer, info) => {
    if (!outer.loads?.length) return { ...outer, input, head: info };
    return merge(outer, null, issuesOf, info, input, combinedLayout(null, outer, geo.lMin), split.notes);
  };

  if (geo.kind === 'small' && !internal) {
    // Edge/corner: slab section around the clipped drop at 2d (Eq. 6.34/6.35 are for internal columns).
    const face = { u0: base.u0, d, label: 'Maximum punching stress at u0 (slab d, conservative)' };
    const outer = calculate(asColumn(input, dropAsColumn), { betaCap, face, label: 'Slab outside the drop at 2d', ...zone(split.slab, 0) });
    hint(outer);
    return single(outer, { kind: 'small', edge: true, columnModel: base.model, ...geo, d, rcont: null, sections: [extSection(outer, 'Fig. 6.15 (interpretation)')] });
  }
  if (geo.kind === 'small') {
    const rc = rcontSmall(input, d);
    const sub = asColumn(input, { shape: 'circular', diameter: 2 * (rc.r - 2 * d), rotation: 0 });
    const face = { u0: perimeterAtOffset(input.column, 0), d, label: 'Maximum punching stress at the column face (slab d, conservative)', detail: 'u0 = column perimeter; d of the slab ignores the head depth.' };
    // Circular heads: the equivalent circle is the head itself, so links follow the head outline.
    if (geo.circular) {
      const outer = calculate(sub, { betaCap, face, label: `Slab at r_cont (${rc.eq})`, ...zone(split.slab, 0) });
      return single(outer, { kind: 'small', columnModel: base.model, ...geo, d, rcont: rc, sections: [extSection(outer, rc.eq)] });
    }
    // Rectangular heads: check on the equivalent circle, links on the head outline (head-mapped.mjs).
    const circle = calculate(sub, { betaCap, face, label: `Slab at r_cont (${rc.eq})`, noLinks: 'mapped' });
    const rect = calculate(asColumn(input, dropAsColumn), { betaCap, face: { skip: true }, noLinks: 'geometry only' });
    const info = { kind: 'small', columnModel: base.model, ...geo, d, rcont: rc, mapped: true, sections: [{ ...extSection(circle, rc.eq), model: rect.model ?? circle.model }] };
    if (!circle.loads?.length || !rect.model) return { ...circle, input, head: info };
    const mapped = mappedHeadLinks({ circle, rectModel: rect.model, input, rc, lHalfMin: Math.min(input.head.lx, input.head.ly) / 2, layers: split.slab });
    const result = merge({ ...circle, loads: mapped.loads }, null, issuesOf, info, input, combinedLayout(null, { layout: mapped.layout }, geo.lMin), split.notes);
    return { ...result, compactOuterZone: mapped.compactOuterZone, detailing: mapped.detailing, mapping: { sectors: mapped.worstSector, tOut: mapped.tOut } };
  }
  const extEq = geo.circular ? 'Eq. 6.36' : internal ? '§6.4.2(9)' : 'Fig. 6.15 (interpretation)';
  if (!inside) {
    // Only the slab section; the face check uses the column perimeter with d_H (§6.4.2(10)).
    const face = { u0: base.u0, d: dH, label: 'Maximum punching stress at u0 (d_H)' };
    const outer = calculate(asColumn(input, dropAsColumn), { betaCap, face, label: 'Slab outside the drop at u1,ext', ...zone(split.slab, 0) });
    hint(outer);
    return single(outer, { kind: 'large', inner: false, columnModel: base.model, edge: !internal, ...geo, d, dH, sections: [extSection(outer, extEq)] });
  }
  const c = input.slab.cover;
  const dropBox = geo.circular ? null : { xMin: geo.extents.xMin + c, xMax: geo.extents.xMax - c, yMin: geo.extents.yMin + c, yMax: geo.extents.yMax - c };
  const inner = calculate(deeper(input, geo.hH), { u1Offset: 2 * dH, linkLimit: geo.lMin - c, dropBox, label: 'Inside the drop (d_H)', ...zone(split.drop, 0) });
  const outer = calculate(asColumn(input, dropAsColumn), { betaCap, face: { skip: true }, label: 'Slab outside the drop at u1,ext', ...zone(split.slab, inner.layout?.layers.length ?? 0) });
  hint(outer);
  const info = {
    kind: 'large', inner: true, columnModel: base.model, edge: !internal, ...geo, d, dH,
    sections: [{ id: 'int', label: 'Inside the drop', d: dH, offset: 2 * dH, model: inner.model, u1: inner.u1, eq: geo.circular ? 'Eq. 6.37' : '§6.4.2(10)' }, extSection(outer, extEq)],
  };
  if (!inner.loads?.length) return { ...inner, input, head: info };
  if (!outer.loads?.length) return { ...outer, input, head: info, status: worstState([outer.status, inner.status]) };
  return merge(inner, outer, issuesOf, info, input, combinedLayout(inner, outer, geo.lMin), split.notes);
}
