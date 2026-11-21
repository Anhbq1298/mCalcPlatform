// Drop panels and enlarged column heads, EN 1992-1-1 §6.4.2(8)–(11), Figs. 6.17 and 6.18.
// Each control section is solved as an ordinary internal-column check by calculate() with a modified
// loaded area or depth; the results are merged so that the worst section governs.
//   l_H < 2h_H: one section in the slab at r_cont (Eq. 6.33 circular, Eq. 6.34/6.35 rectangular).
//   l_H > 2h_H: a section inside the head with d_H = d + h_H at 2d_H from the column face, and a
//               section in the slab at 2d from the head edge. Eq. 6.36/6.37 are stated for circular
//               columns; for rectangular heads the same offsets are an interpretation.
import { calculate, worstState } from './calculate.mjs';
import { perimeterAtOffset } from './geometry.mjs';
import { STATES, derivedSection, restoreInputs } from './inputs.mjs';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Clear distances l_H from the column face to the head edge (local x and y) and the case.
export function headGeometry(input) {
  const { column, head } = input;
  const circular = column.shape === 'circular';
  const lH = circular ? [(head.diameter - column.diameter) / 2] : [(head.lx - column.cx) / 2, (head.ly - column.cy) / 2];
  const hH = head.depth;
  const below = lH.every(value => value <= 2 * hH + 1e-9);
  const above = lH.every(value => value > 2 * hH + 1e-9);
  return { circular, lH, lMin: Math.min(...lH), hH, kind: below ? 'small' : above ? 'large' : 'mixed' };
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
  if (headGeometry(input).lH.some(value => value <= 0)) issues.push({ state: STATES.incomplete, message: 'The drop must be larger than the column on every side.' });
  if (base.position?.kind && base.position.kind !== 'internal') issues.push({ state: STATES.unsupportedGeometry, message: 'Drops are implemented for internal columns only; EN 1992-1-1 Figs. 6.17 and 6.18 show internal columns.' });
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
  const rowsOf = governing?.rows.filter(entry => entry.ur !== null && Number.isFinite(entry.ur)) ?? [];
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
  const offset = Math.min(2 * dH, geo.lMin);
  const headIssues = [...momentBeta];
  if (offset < 2 * dH - 1e-9) headIssues.push({ state: STATES.confirm, message: `2d_H = ${(2 * dH).toFixed(0)} mm exceeds l_H = ${geo.lMin.toFixed(0)} mm: Fig. 6.18 assumes l_H > 2(d + h_H). The inner section is taken at the head edge.` });
  if (!geo.circular && input.head.confirmed !== true) headIssues.push({ state: STATES.confirm, message: 'Eq. 6.36/6.37 are given for circular columns (§6.4.2(11)). For this rectangular head the sections are offset 2d_H from the column face and 2d from the head edge. Confirm this interpretation to remove the status.' });
  const inner = calculate(deeper(input, geo.hH), { u1Offset: offset, linkLimit: geo.lMin - input.slab.cover, label: 'Inside the drop (d_H)' });
  const size = geo.circular ? { diameter: input.head.diameter } : { cx: input.head.lx, cy: input.head.ly };
  const outer = calculate(asColumn(input, size), { face: { skip: true }, label: 'Slab outside the drop at u1,ext', noLinks: 'v_Ed > v_Rd,c in the slab outside the drop. Links outside the drop are not implemented; enlarge the drop or the slab depth.' });
  const info = {
    kind: 'large', ...geo, d, dH,
    sections: [
      { id: 'int', label: 'Inside the drop', d: dH, offset, model: inner.model, u1: inner.u1, eq: geo.circular ? 'Eq. 6.37' : '§6.4.2(10)' },
      { id: 'ext', label: 'Slab outside the drop', d, offset: 2 * d, model: outer.model, u1: outer.u1, eq: geo.circular ? 'Eq. 6.36' : '§6.4.2(9)' },
    ],
  };
  if (!inner.loads?.length) return { ...inner, input, head: info };
  if (!outer.loads?.length) return { ...outer, input, head: info, status: worstState([outer.status, inner.status]) };
  return merge(inner, outer, headIssues, info, input);
}
