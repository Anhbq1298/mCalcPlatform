// CAD-style plan of the connection: slab edges, openings, column, control perimeters, link layers,
// individual links and legs, and the governing tangential gap. Returns an SVG string.
import { pathExtent, pathPolyline, pointAt, toGlobal } from './geometry.mjs';
import { intervalPolylines } from './perimeters.mjs';
import { COLORS, DASH, dimension, esc, grid, n, polyline, svgDocument, viewport } from './svg.mjs';
import { headOutline } from './head-drawing.mjs';

// Label position along a path: a fixed fraction of a closed path (labels of different perimeters
// do not stack), or the middle of the first effective interval of a clipped one.
function firstEffective(model, r, fraction = 0) {
  const geometry = model?.intervalsAt(r);
  const item = geometry?.intervals[0];
  if (!item) return 0;
  return item.closed ? fraction * geometry.u : (item.s0 + item.s1) / 2;
}

// Worst tangential gap of the governing combination, in the section (column or drop) that owns it.
function governingGap(result, extColumn) {
  const load = result.loads?.find(entry => entry.name === result.governing?.load);
  const rows = [
    ...(load?.layoutCheck?.layerRows ?? []).map(entry => ({ ...entry, column: result.model?.column })),
    ...(load?.ext?.layoutCheck?.layerRows ?? []).map(entry => ({ ...entry, column: extColumn })),
  ].filter(entry => entry.column);
  const worst = rows.reduce((best, entry) => (!best || (entry.tangential.ur ?? 0) > (best.tangential.ur ?? 0) ? entry : best), null);
  if (!worst) return null;
  const gap = worst.layer.tangential.gaps.reduce((a, b) => (b.length > a.length ? b : a));
  return { layer: worst.layer, gap, column: worst.column, fails: worst.tangential.status === 'Fail' };
}

export function planSvg(result, { width = 640, height = 600, selected = null } = {}) {
  const input = result.input;
  const column = input.column;
  const pathColumn = result.model?.column ?? column; // loaded area of the solved section
  const head = result.head;
  const d = result.section?.d ?? 0;
  const u1Offset = result.u1Offset ?? 2 * d;
  const layers = result.layout?.layers ?? [];
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const ext = head?.kind === 'large' && head.inner ? head.sections.find(item => item.id === 'ext') : null;
  const outerOnly = (head?.kind === 'large' && !head.inner) || (head?.kind === 'small' && !head.rcont);
  const extSection = head?.sections?.find(item => item.id === 'ext');
  const extModel = extSection?.model ?? null; // the drop as the loaded area
  const extOut = ext && extSection.aOut > 0 ? extSection.aOut : 0; // u_out,ef of the slab section
  const headReach = head ? Math.max(...head.lH) + Math.max(2 * head.d, extOut) : 0;
  const efReach = result.layout?.outerEf ? Math.max(...layers.map(layer => layer.offset)) * Math.SQRT2 + 1.5 * d : 0; // grid ring corners
  const reach = Math.max(u1Offset, aOut, headReach, efReach, ...layers.map(layer => layer.offset), 0);
  const legendHeight = 40;
  const extent = pathExtent(column, reach);
  const margin = Math.max(160, 0.16 * Math.max(extent.xMax - extent.xMin, extent.yMax - extent.yMin));
  const bounds = { xMin: extent.xMin - margin, xMax: extent.xMax + margin, yMin: extent.yMin - margin, yMax: extent.yMax + margin };
  const view = viewport(bounds, width, height - legendHeight);
  const parts = [];
  const { slab } = input;
  const clip = { x0: Math.max(slab.xMin, bounds.xMin), x1: Math.min(slab.xMax, bounds.xMax), y0: Math.max(slab.yMin, bounds.yMin), y1: Math.min(slab.yMax, bounds.yMax) };
  parts.push(`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${COLORS.ink}" stroke-width=".7"/></pattern>`
    + `<pattern id="concrete" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="white"/><line x1="0" y1="0" x2="0" y2="6" stroke="${COLORS.ink}" stroke-width=".6"/></pattern></defs>`);
  parts.push(grid(view, bounds, 0, height - legendHeight, width));
  if (clip.x0 < clip.x1 && clip.y0 < clip.y1) {
    for (const [key, x0, y0, x1, y1] of [['xMin', slab.xMin, clip.y0, slab.xMin, clip.y1], ['xMax', slab.xMax, clip.y0, slab.xMax, clip.y1], ['yMin', clip.x0, slab.yMin, clip.x1, slab.yMin], ['yMax', clip.x0, slab.yMax, clip.x1, slab.yMax]]) {
      const inside = key.startsWith('x') ? x0 >= bounds.xMin && x0 <= bounds.xMax : y0 >= bounds.yMin && y0 <= bounds.yMax;
      if (inside) parts.push(`<line x1="${n(view.x(x0))}" y1="${n(view.y(y0))}" x2="${n(view.x(x1))}" y2="${n(view.y(y1))}" stroke="${COLORS.edge}" stroke-width="1.6"/><text class="small" x="${n(view.x((x0 + x1) / 2) + 4)}" y="${n(view.y((y0 + y1) / 2) - 4)}">SLAB EDGE</text>`);
    }
  }
  (input.openings || []).forEach((opening, index) => {
    const x = view.x(opening.x - opening.w / 2);
    const y = view.y(opening.y + opening.h / 2);
    parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(opening.w * view.scale)}" height="${n(opening.h * view.scale)}" fill="white" stroke="${COLORS.ink}" stroke-width="1.2"/><path d="M${n(x)} ${n(y)}l${n(opening.w * view.scale)} ${n(opening.h * view.scale)}M${n(x + opening.w * view.scale)} ${n(y)}l${n(-opening.w * view.scale)} ${n(opening.h * view.scale)}" stroke="${COLORS.ink}" stroke-width=".6"/><text class="label" x="${n(x + 3)}" y="${n(y - 4)}">O${index + 1}</text>`);
  });
  const labelAt = (r, text, color, s = 0) => {
    const p = toGlobal(pathColumn, pointAt(pathColumn, r, s));
    return `<text class="label" x="${n(view.x(p.x) + 4)}" y="${n(view.y(p.y) - 4)}" fill="${color}">${esc(text)}</text>`;
  };
  const model = result.model;
  // Ineffective portions (outside the slab, in openings or opening shadows) are drawn faint.
  const perimeter = (r, color, dash, width = 1.4, m = model) => {
    const pc = m?.column ?? pathColumn;
    const out = [polyline(pathPolyline(pc, r), view, `fill="none" stroke="${COLORS.rule}" stroke-width=".8" stroke-dasharray="1 3"`)];
    const intervals = m ? m.intervalsAt(r).intervals : [{ s0: 0, s1: 0, closed: true }];
    const lines = m ? intervalPolylines(m, r, intervals) : [pathPolyline(pc, r)];
    for (const line of lines) out.push(polyline(line, view, `fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}"`));
    return out.join('');
  };
  for (const shadow of result.shadows ?? []) {
    const r = reach + 200;
    for (const angle of [shadow.mid + shadow.low, shadow.mid + shadow.high]) {
      const end = { x: column.x + r * Math.cos(angle), y: column.y + r * Math.sin(angle) };
      parts.push(`<line x1="${n(view.x(column.x))}" y1="${n(view.y(column.y))}" x2="${n(view.x(end.x))}" y2="${n(view.y(end.y))}" stroke="${COLORS.muted}" stroke-width=".7" stroke-dasharray="4 3"/>`);
    }
  }
  const outerEf = result.layout?.outerEf;
  if (aOut > 0 && outerEf) {
    // §6.4.5(4): u_out,req at a_out (uniform shape, for orientation) and the line kd = 1.5d inside it that the
    // outer links must reach; Fig. 6.22: the effective perimeter 1.5d outside the outer links as built.
    const inner = Math.max(aOut - 1.5 * d, 0);
    parts.push(perimeter(aOut, COLORS.muted, '2 3', 0.8));
    parts.push(labelAt(aOut, 'u_out,req (a_out)', COLORS.muted, 0.2 * model.intervalsAt(aOut).u));
    if (inner > 0) parts.push(perimeter(inner, COLORS.muted, '6 2 1 2', 0.8));
    const lines = effectiveOuterLines(outerEf.segments, 1.5 * d).map(line => line.map(p => toGlobal(model.column, p)));
    for (const line of lines) parts.push(polyline(line, view, `fill="none" stroke="${COLORS.uout}" stroke-width="1.2" stroke-dasharray="${DASH.uout}"`));
    const tip = lines.flat().reduce((low, p) => (!low || p.y < low.y ? p : low), null); // lowest point
    if (tip) parts.push(`<text class="label" x="${n(view.x(tip.x) + 40)}" y="${n(view.y(tip.y) + 14)}" fill="${COLORS.uout}">u_out,ef</text>`);
    // Callout in the free top-left corner: position rule and length check.
    const req = model.intervalsAt(aOut).total;
    const last = layers.at(-1);
    const ok = outerEf.u >= req - 1e-6;
    [`u_out,req = βV/(v_Rd,c·d) = ${req.toFixed(0)} mm (drawn at a_out = ${aOut.toFixed(0)})`,
      `outer links ≥ a_out − 1.5d = ${inner.toFixed(0)} mm (dash-dot): ${last.id} at ${last.offset.toFixed(0)}`,
      `u_out,ef (Fig. 6.22) = ${outerEf.u.toFixed(0)} ${ok ? '≥' : '<'} ${req.toFixed(0)} mm: ${ok ? 'OK' : 'NOT OK'}`,
    ].forEach((line, k) => parts.push(`<text class="small" x="12" y="${18 + 14 * k}">${esc(line)}</text>`));
  } else if (aOut > 0) {
    parts.push(perimeter(aOut, COLORS.uout, DASH.uout, 1));
    parts.push(labelAt(aOut, 'u_out,ef', COLORS.uout, firstEffective(model, aOut, 0.16)));
  }
  if (head) parts.push(headOutline(input, view, Math.max(26, (reach - Math.min(...head.lH)) * view.scale * 0.75)));
  if (ext) {
    parts.push(polyline(pathPolyline(ext.model.column, 2 * head.d), view, `fill="none" stroke="${COLORS.ink}" stroke-width="1.1" stroke-dasharray="${DASH.ext}"`, true));
    const p = toGlobal(ext.model.column, pointAt(ext.model.column, 2 * head.d, 0.09 * ext.u1));
    parts.push(`<text class="label" x="${n(view.x(p.x) + 4)}" y="${n(view.y(p.y) - 4)}">u1,ext (2d from drop)</text>`);
    if (extOut > 0) {
      parts.push(perimeter(extOut, COLORS.uout, DASH.uout, 1, extModel));
      const q = toGlobal(extModel.column, pointAt(extModel.column, extOut, firstEffective(extModel, extOut, 0.2)));
      parts.push(`<text class="label" x="${n(view.x(q.x) + 4)}" y="${n(view.y(q.y) - 4)}">u_out,ef,ext</text>`);
    }
  }
  if (d > 0) {
    parts.push(perimeter(u1Offset, COLORS.u1, DASH.u1, 1.3));
    const u1Label = toGlobal(pathColumn, pointAt(pathColumn, u1Offset, firstEffective(model, u1Offset, head?.kind === 'small' ? 0.1 : 0.3)));
    const name = outerOnly || (head?.kind === 'small' && !head.rcont) ? 'u1,ext (2d from drop)' : head?.kind === 'large' ? 'u1,int (d_H)' : head?.kind === 'small' ? `u1 at r_cont (${head.rcont.eq})` : 'u1 (2d)';
    parts.push(`<text class="label" x="${n(view.x(u1Label.x) + 4)}" y="${n(view.y(u1Label.y) - 5)}">${esc(name)}</text>`);
  }
  // Layers beyond the drop follow the drop outline (pathOffset from the drop edge).
  for (const [index, layer] of layers.entries()) {
    const m = layer.zone === 'slab' && extModel ? extModel : model;
    const r = layer.pathOffset ?? layer.offset;
    const pc = m?.column ?? pathColumn;
    parts.push(perimeter(r, COLORS.muted, DASH.layer, 0.6, m));
    const p = toGlobal(pc, pointAt(pc, r, firstEffective(m, r, 0.42)));
    const zoneEnd = layers[index + 1]?.zone !== layer.zone || layers[index - 1]?.zone !== layer.zone;
    if (index === 0 || index === layers.length - 1 || zoneEnd) parts.push(`<text class="small" x="${n(view.x(p.x) - 6)}" y="${n(view.y(p.y) - 6)}" text-anchor="end">${esc(layer.id ?? 'L' + (index + 1))}</text>`);
  }
  const gov = governingGap(result, extModel?.column);
  if (gov) {
    const points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) points.push(toGlobal(gov.column, pointAt(gov.column, gov.layer.offset, gov.gap.s0 + (gov.gap.length * i) / steps)));
    parts.push(polyline(points, view, `fill="none" stroke="${gov.fails ? COLORS.ink : COLORS.governing}" stroke-width="4" stroke-opacity=".75" stroke-linecap="round"${gov.fails ? ' stroke-dasharray="6 3"' : ''} data-governing="${esc(gov.layer.id)}"`));
  }
  const outline = column.shape === 'circular' ? pathPolyline(column, 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: sx * column.cx / 2, y: sy * column.cy / 2 }));
  parts.push(polyline(outline, view, `fill="url(#concrete)" stroke="${COLORS.ink}" stroke-width="1.6"`, true));
  const reachLine = reach + 0.6 * margin;
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    const a = toGlobal(column, { x: -ax * reachLine, y: -ay * reachLine });
    const b = toGlobal(column, { x: ax * reachLine, y: ay * reachLine });
    parts.push(`<line x1="${n(view.x(a.x))}" y1="${n(view.y(a.y))}" x2="${n(view.x(b.x))}" y2="${n(view.y(b.y))}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);
    parts.push(sectionMark(view.x(a.x), view.y(a.y), view.x(b.x), view.y(b.y), ax ? 'A' : 'B'));
  }
  for (const link of result.layout?.links ?? []) {
    const radius = Math.max(2.4, (link.diameter / 2) * view.scale);
    const isSelected = selected === link.id;
    let body = '';
    if (link.legs.length === 2) body += `<line x1="${n(view.x(link.legs[0].x))}" y1="${n(view.y(link.legs[0].y))}" x2="${n(view.x(link.legs[1].x))}" y2="${n(view.y(link.legs[1].y))}" stroke="${COLORS.link}" stroke-width="1.6"/>`;
    for (const leg of link.legs) {
      const x = view.x(leg.x);
      const y = view.y(leg.y);
      body += leg.effective
        ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius + 0.6)}" fill="${COLORS.link}" stroke="white" stroke-width=".6"/>`
        : `<circle data-ineffective="1" cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="white" stroke="${COLORS.muted}" stroke-width="1.1"/><path d="M${n(x - radius)} ${n(y - radius)}L${n(x + radius)} ${n(y + radius)}M${n(x - radius)} ${n(y + radius)}L${n(x + radius)} ${n(y - radius)}" stroke="${COLORS.muted}"/>`;
      if (isSelected) body += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius + 4)}" fill="none" stroke="${COLORS.governing}" stroke-width="2"/>`;
    }
    parts.push(`<g class="link" data-link="${esc(link.id)}"><title>${esc(link.id)} · Ø${link.diameter}</title>${body}</g>`);
  }
  parts.push(planDimensions(column, view));
  parts.push(axes(height - legendHeight, column));
  parts.push(legend(width, height, legendHeight, { ineffective: (result.layout?.links ?? []).some(link => link.legs.some(leg => !leg.effective)), ext: Boolean(ext), out: aOut > 0 || extOut > 0, head: Boolean(head), gap: layers.length > 0 }, keyValues({ d, u1Offset, aOut, layers, head, column, input })));
  return svgDocument(width, height, 'Punching shear plan', parts.join(''));
}

function planDimensions(column, view) {
  const at = (x, y) => { const p = toGlobal(column, { x, y }); return [view.x(p.x), view.y(p.y)]; };
  if (column.shape === 'circular') {
    const r = column.diameter / 2;
    return dimension(...at(-r, r), ...at(r, r), `D = ${column.diameter}`, -14);
  }
  const a = column.cx / 2;
  const b = column.cy / 2;
  return dimension(...at(-a, b), ...at(a, b), `c_x = ${column.cx}`, -14) + dimension(...at(-a, -b), ...at(-a, b), `c_y = ${column.cy}`, -14);
}

// Section cut mark at both ends of a cut line: heavy stub, view arrow (to the left of the cut
// direction) and the section letter in a circle.
function sectionMark(x1, y1, x2, y2, letter) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = uy;
  const ny = -ux;
  let out = '';
  for (const [x, y, s] of [[x1, y1, 1], [x2, y2, -1]]) {
    const sx = x + ux * 14 * s;
    const sy = y + uy * 14 * s;
    out += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(sx)}" y2="${n(sy)}" stroke="${COLORS.ink}" stroke-width="2.2"/>`
      + `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + nx * 12)}" y2="${n(y + ny * 12)}" stroke="${COLORS.ink}" stroke-width="1"/>`
      + `<path d="M${n(x + nx * 14)} ${n(y + ny * 14)}L${n(x + nx * 8 - ux * 3)} ${n(y + ny * 8 - uy * 3)}L${n(x + nx * 8 + ux * 3)} ${n(y + ny * 8 + uy * 3)}Z" fill="${COLORS.ink}"/>`
      + `<circle cx="${n(x - ux * 11 * s)}" cy="${n(y - uy * 11 * s)}" r="8" fill="white" stroke="${COLORS.ink}" stroke-width=".8"/>`
      + `<text x="${n(x - ux * 11 * s)}" y="${n(y - uy * 11 * s + 4)}" text-anchor="middle">${letter}</text>`;
  }
  return out;
}

function axes(bottom, column) {
  const x0 = 18;
  const y0 = bottom - 14;
  return `<g stroke="${COLORS.ink}" stroke-width="1.2"><line x1="${x0}" y1="${y0}" x2="${x0 + 34}" y2="${y0}"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - 34}"/>`
    + `<path d="M${x0 + 34} ${y0}l-6 -3v6z" fill="${COLORS.ink}"/><path d="M${x0} ${y0 - 34}l-3 6h6z" fill="${COLORS.ink}"/></g>`
    + `<text x="${x0 + 38}" y="${y0 + 4}">X</text><text x="${x0 - 4}" y="${y0 - 38}">Y</text>`
    + `<text class="small" x="${x0 + 60}" y="${y0 + 4}">Column centre (${column.x}, ${column.y}) mm · rotation ${column.rotation}°</text>`;
}

// Key dimensions as one text line in the legend (the plan carries no radial dimension lines).
function keyValues({ d, u1Offset, aOut, layers, head, input }) {
  const out = [];
  if (layers.length) {
    out.push(layers[0].zone === 'slab' ? `a1 = ${layers[0].pathOffset.toFixed(0)} from the drop` : `a1 = ${layers[0].offset.toFixed(0)}`);
    const radial = [...new Set(layers.slice(1).filter((layer, i) => layer.zone === layers[i].zone).map(layer => (layer.offset - layers[layers.indexOf(layer) - 1].offset).toFixed(0)))];
    if (radial.length) out.push(`s_r = ${radial.join(' / ')}`);
  }
  if (head?.kind === 'small' && head.rcont) out.push(`r_cont = ${head.rcont.r.toFixed(0)}`);
  else if (head?.kind === 'small') out.push(`2d = ${(2 * head.d).toFixed(0)} from drop`);
  else if (d > 0 && !(head?.kind === 'large' && !head.inner)) out.push(`${head?.kind === 'large' ? '2d_H' : '2d'} = ${u1Offset.toFixed(0)}`);
  if (head) out.push(`h_tot = ${input.head.thickness}`, `l_H = ${head.lH.map(v => v.toFixed(0)).join(' / ')}`);
  if (head?.kind === 'large') out.push(`l_H + 2d = ${(head.lMin + 2 * head.d).toFixed(0)}`);
  const fromDrop = head && !(head.kind === 'large' && head.inner);
  if (aOut > 0) out.push(`a_out = ${aOut.toFixed(0)}${head?.rcont ? ' from the equivalent circle' : fromDrop ? ' from the drop' : ''}`);
  return out.join(' · ') + (out.length ? ' (mm from the column face)' : '');
}

function legend(width, height, legendHeight, show, values = '') {
  const y = height - legendHeight + 16;
  const entries = [
    [true, `<circle cx="5" cy="0" r="4" fill="${COLORS.link}"/>`, 'Shear link leg'],
    [show.ineffective, `<circle cx="5" cy="0" r="4" fill="white" stroke="${COLORS.muted}"/><path d="M2 -3L8 3M2 3L8 -3" stroke="${COLORS.muted}"/>`, 'Ineffective leg'],
    [true, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.u1}" stroke-width="1.3"/>`, 'u1'],
    [show.ext, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.ext}"/>`, 'u1,ext'],
    [show.out, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.uout}"/>`, 'u_out,ef'],
    [show.head, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.drop}" stroke-width="1.2" stroke-dasharray="${DASH.hidden}"/>`, 'Drop (hidden, below)'],
    [show.gap, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.governing}" stroke-width="4"/>`, 'Governing gap'],
    [true, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.edge}" stroke-width="1.6"/>`, 'Slab edge'],
  ].filter(([on]) => on);
  let x = 14;
  const items = entries.map(([, symbol, text]) => {
    const g = `<g class="legend" transform="translate(${x} ${y})">${symbol}<text class="small" x="18" y="4">${esc(text)}</text></g>`;
    x += 30 + text.length * 6.2;
    return g;
  }).join('');
  return `<line x1="0" y1="${height - legendHeight}" x2="${width}" y2="${height - legendHeight}" stroke="${COLORS.rule}"/>` + items
    + `<text class="small" x="14" y="${y + 18}">${esc(values || 'Dimensions in mm.')}</text>`;
}

// Counted parts of u_out,ef (Fig. 6.22), local coordinates: each side of the outer-link polygon offset by
// r outward (the full side when ≤ 2d, else d at each end), and the arcs of radius r round each link.
function effectiveOuterLines(segments, r) {
  const d = r / 1.5;
  const normal = seg => ({ x: (seg.to.y - seg.from.y) / seg.length, y: -(seg.to.x - seg.from.x) / seg.length });
  const lines = [];
  segments.forEach((seg, i) => {
    const nrm = normal(seg);
    const at = t => ({ x: seg.from.x + (seg.to.x - seg.from.x) * t + r * nrm.x, y: seg.from.y + (seg.to.y - seg.from.y) * t + r * nrm.y });
    if (seg.length <= 2 * d + 1e-9) lines.push([at(0), at(1)]);
    else lines.push([at(0), at(d / seg.length)], [at(1 - d / seg.length), at(1)]);
    const next = segments[(i + 1) % segments.length];
    const n2 = normal(next);
    let a0 = Math.atan2(nrm.y, nrm.x);
    let a1 = Math.atan2(n2.y, n2.x);
    while (a1 < a0 - 1e-9) a1 += 2 * Math.PI; // collinear sides: no arc (not a full turn)
    const steps = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 24)));
    lines.push(Array.from({ length: steps + 1 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / steps;
      return { x: seg.to.x + r * Math.cos(a), y: seg.to.y + r * Math.sin(a) };
    }));
  });
  return lines;
}
