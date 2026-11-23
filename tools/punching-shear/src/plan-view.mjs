// CAD-style plan of the connection: slab edges, openings, column, control perimeters, link layers,
// individual links and legs, and the governing tangential gap. Returns an SVG string.
import { pathExtent, pathPolyline, pointAt, toGlobal } from './geometry.mjs';
import { intervalPolylines } from './perimeters.mjs';
import { COLORS, DASH, callout, esc, grid, n, polyline, svgDocument, viewport } from './svg.mjs';
import { compositeLines, headOutline } from './head-drawing.mjs';

// Label position along a path: a fixed fraction of a closed path (labels of different perimeters
// do not stack), or the middle of the first effective interval of a clipped one.
function firstEffective(model, r, fraction = 0) {
  const geometry = model?.intervalsAt(r);
  const item = geometry?.intervals[0];
  if (!item) return 0;
  return item.closed ? fraction * geometry.u : (item.s0 + item.s1) / 2;
}

// Worst tangential gap of the governing combination, in the section (column or drop) that owns it.
function governingGap(result, load, extColumn, checkId) {
  const rows = [
    ...(load?.layoutCheck?.layerRows ?? []).map(entry => ({ ...entry, column: result.model?.column })),
    ...(load?.ext?.layoutCheck?.layerRows ?? []).map(entry => ({ ...entry, column: extColumn })),
  ].filter(entry => entry.column && entry.layer.tangential.gaps.length
    && (!checkId || checkId.startsWith('ext-') === (entry.column === extColumn)));
  const worst = rows.reduce((best, entry) => (!best || (entry.tangential.ur ?? 0) > (best.tangential.ur ?? 0) ? entry : best), null);
  if (!worst) return null;
  const gap = worst.layer.tangential.gaps.reduce((a, b) => (b.length > a.length ? b : a));
  return { layer: worst.layer, gap, column: worst.column, fails: worst.tangential.status === 'Fail' };
}

export function planSvg(result, { width = 640, height = 600, selected = null, checkId = null, loadId = null } = {}) {
  const input = result.input;
  const load = result.loads?.find(entry => entry.id === (loadId ?? result.governing?.loadId));
  const activeRow = load?.rows.find(row => row.id === checkId);
  const selectedCheck = (id, outer = false) => checkId === (outer ? 'ext-' : '') + id;
  const stroke = (id, color, outer = false) => selectedCheck(id, outer) ? COLORS.governing : color;
  const basicSelected = ['concrete', 'reinforced', 'kmax'].some(id => selectedCheck(id));
  const extSelected = ['concrete', 'reinforced', 'kmax'].some(id => selectedCheck(id, true));
  const column = input.column;
  const pathColumn = result.model?.column ?? column; // loaded area of the solved section
  const head = result.head;
  const d = result.section?.d ?? 0;
  const u1Offset = result.u1Offset ?? 2 * d;
  const layers = result.layout?.layers ?? [];
  const aOut = Math.max(0, (loadId ? load?.required && load.aOut : result.envelope?.aOut) || 0);
  const ext = head?.kind === 'large' && head.inner ? head.sections.find(item => item.id === 'ext') : null;
  const outerOnly = (head?.kind === 'large' && !head.inner) || (head?.kind === 'small' && !head.rcont);
  const extSection = head?.sections?.find(item => item.id === 'ext');
  const extModel = extSection?.model ?? null; // the drop as the loaded area
  const headReach = head ? Math.max(...head.lH) + 2 * head.d : 0;
  // Drawn: u1, u1,ext and the links (grid ring corners lie up to √2 × the ring offset out).
  const linkReach = Math.max(0, ...(result.layout?.links ?? []).map(link => Math.hypot(link.position.x - column.x, link.position.y - column.y) - Math.min(column.cx ?? column.diameter, column.cy ?? column.diameter) / 2));
  const reach = Math.max(u1Offset, headReach, linkReach, ...layers.map(layer => layer.offset), 0);
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
  // Plan shows the control perimeters only: u0 (column face), u1 and u1,ext. u_out and the link layer
  // guides are reported in the checks, not drawn.
  if (head) parts.push(headOutline(input, view, Math.max(26, (reach - Math.min(...head.lH)) * view.scale * 0.75)));
  if (ext) {
    parts.push(polyline(pathPolyline(ext.model.column, 2 * head.d), view, `fill="none" stroke="${extSelected ? COLORS.governing : COLORS.ink}" stroke-width="${extSelected ? 3 : 1.1}" stroke-dasharray="${DASH.ext}"`, true));
    const p = toGlobal(ext.model.column, pointAt(ext.model.column, 2 * head.d, 0.875 * ext.u1)); // lower right
    parts.push(callout(view.x(p.x), view.y(p.y), 1, 1, 30, ['u1,ext (2d from drop)']));
  }
  if (d > 0 && head?.composite) parts.push(compositeLines(head, pathColumn, view, basicSelected ? COLORS.governing : COLORS.u1, basicSelected ? 3 : 1.6));
  else if (d > 0) {
    parts.push(perimeter(u1Offset, basicSelected ? COLORS.governing : COLORS.u1, DASH.u1, basicSelected ? 3 : 1.3));
    const u1At = toGlobal(pathColumn, pointAt(pathColumn, u1Offset, firstEffective(model, u1Offset, 0.125 * model.intervalsAt(u1Offset).u))); // upper right
    const name = outerOnly || head?.kind === 'small' ? 'u1,ext (2d from drop)' : head?.kind === 'large' ? 'u1,int (d_H)' : 'u1 (2d)';
    parts.push(callout(view.x(u1At.x), view.y(u1At.y), 1, -1, 30, [name]));
  }
  for (const [index, layer] of layers.entries()) {
    const m = layer.zone === 'slab' && extModel ? extModel : model;
    const r = layer.pathOffset ?? layer.offset;
    const pc = m?.column ?? pathColumn;
    const active = activeRow?.governing === layer.id;
    // Layer labels only; the plan draws no layer guides (control perimeters u0, u1, u1,ext only).
    const zoneEnd = layers[index + 1]?.zone !== layer.zone || layers[index - 1]?.zone !== layer.zone;
    if (index === 0 || index === layers.length - 1 || zoneEnd || active || selected === layer.id) {
      const p = layer.points
        ? result.layout.links.filter(link => link.layerId === layer.id).reduce((left, link) => {
          const point = link.position;
          return !left || point.x < left.x - 1e-6 || (Math.abs(point.x - left.x) <= 1e-6 && Math.abs(point.y - column.y) < Math.abs(left.y - column.y)) ? point : left;
        }, null)
        : toGlobal(pc, pointAt(pc, r, firstEffective(m, r, 0.42)));
      if (p) parts.push(`<text class="small" x="${n(view.x(p.x) - 8)}" y="${n(view.y(p.y) - 6)}" text-anchor="end">${esc(layer.id ?? 'L' + (index + 1))}</text>`);
    }
  }
  const gapCheck = checkId === 'tangential' || checkId === 'ext-tangential';
  const gov = !checkId || gapCheck ? governingGap(result, load, ext && extModel?.column, gapCheck ? checkId : null) : null;
  if (gov) {
    const points = [];
    const steps = 40;
    if (gov.gap.from) points.push(toGlobal(gov.column, gov.gap.from), toGlobal(gov.column, gov.gap.to)); // straight gap (grid ring)
    else for (let i = 0; i <= steps; i += 1) points.push(toGlobal(gov.column, pointAt(gov.column, gov.layer.offset, gov.gap.s0 + (gov.gap.length * i) / steps)));
    parts.push(polyline(points, view, `fill="none" stroke="${gov.fails ? COLORS.ink : COLORS.governing}" stroke-width="4" stroke-opacity=".75" stroke-linecap="round"${gov.fails ? ' stroke-dasharray="6 3"' : ''} data-governing="${esc(gov.layer.id)}"`));
  }
  const outline = column.shape === 'circular' ? pathPolyline(column, 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: sx * column.cx / 2, y: sy * column.cy / 2 }));
  parts.push(polyline(outline, view, `fill="url(#concrete)" stroke="${stroke('max', COLORS.ink)}" stroke-width="${selectedCheck('max') ? 3 : 1.6}"`, true));
  // u0 = the column face: leader to the lower left of the face.
  const u0At = toGlobal(column, column.shape === 'circular' ? { x: -column.diameter / 2 * Math.SQRT1_2, y: -column.diameter / 2 * Math.SQRT1_2 } : { x: -column.cx / 4, y: -column.cy / 2 });
  parts.push(callout(view.x(u0At.x), view.y(u0At.y), -1, 1, 22, ['u0 (column face)']));
  const reachLine = reach + 0.6 * margin;
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    const a = toGlobal(column, { x: -ax * reachLine, y: -ay * reachLine });
    const b = toGlobal(column, { x: ax * reachLine, y: ay * reachLine });
    parts.push(`<line x1="${n(view.x(a.x))}" y1="${n(view.y(a.y))}" x2="${n(view.x(b.x))}" y2="${n(view.y(b.y))}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);
    parts.push(sectionMark(view.x(a.x), view.y(a.y), view.x(b.x), view.y(b.y), ax ? 'A' : 'B'));
  }
  for (const link of result.layout?.links ?? []) {
    const radius = Math.max(2.4, (link.diameter / 2) * view.scale);
    const isSelected = selected === link.id || selected === link.layerId || (!selected && activeRow?.governing === link.layerId);
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
  parts.push(axes(height - legendHeight, column));
  parts.push(legend(width, height, legendHeight, { ineffective: (result.layout?.links ?? []).some(link => link.legs.some(leg => !leg.effective)), ext: Boolean(ext), head: Boolean(head), gap: layers.length > 0 }, keyValues({ d, u1Offset, aOut, layers, head, column, input })));
  return svgDocument(width, height, 'Punching shear plan', parts.join(''));
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
function keyValues({ d, u1Offset, aOut, layers, head, column, input }) {
  const out = [column.shape === 'circular' ? `column Ø${column.diameter}` : `column ${column.cx} × ${column.cy}`];
  if (layers.length) {
    out.push(layers[0].zone === 'slab' ? `a1 = ${layers[0].pathOffset.toFixed(0)} from the drop` : `a1 = ${layers[0].offset.toFixed(0)}`);
    const radial = [...new Set(layers.slice(1).filter((layer, i) => layer.zone === layers[i].zone).map(layer => (layer.offset - layers[layers.indexOf(layer) - 1].offset).toFixed(0)))];
    if (radial.length) out.push(`s_r = ${radial.join(' / ')}`);
  }
  else if (head?.kind === 'small') out.push(`2d = ${(2 * head.d).toFixed(0)} from drop`);
  else if (d > 0 && !(head?.kind === 'large' && !head.inner)) out.push(`${head?.kind === 'large' ? '2d_H' : '2d'} = ${u1Offset.toFixed(0)}`);
  if (head) out.push(`h_tot = ${input.head.thickness}`, `l_H = ${head.lH.map(v => v.toFixed(0)).join(' / ')}`);
  if (head?.kind === 'large') out.push(`l_H + 2d = ${(head.lMin + 2 * head.d).toFixed(0)}`);
  const fromDrop = head && !(head.kind === 'large' && head.inner);
  if (aOut > 0) out.push(`a_out = ${aOut.toFixed(0)}${fromDrop ? ' from the drop' : ''}`);
  return out.join(' · ') + (out.length > 1 ? ' (mm; offsets from the column face)' : ' mm');
}

function legend(width, height, legendHeight, show, values = '') {
  const y = height - legendHeight + 16;
  const entries = [
    [true, `<circle cx="5" cy="0" r="4" fill="${COLORS.link}"/>`, 'Shear link leg'],
    [show.ineffective, `<circle cx="5" cy="0" r="4" fill="white" stroke="${COLORS.muted}"/><path d="M2 -3L8 3M2 3L8 -3" stroke="${COLORS.muted}"/>`, 'Ineffective leg'],
    [true, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.u1}" stroke-width="1.3"/>`, 'u1'],
    [show.ext, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.ext}"/>`, 'u1,ext'],
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

