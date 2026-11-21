// CAD-style plan of the connection: slab edges, openings, column, control perimeters, link layers,
// individual links and legs, and the governing tangential gap. Returns an SVG string.
import { pathExtent, pathPolyline, pointAt, toGlobal } from './geometry.mjs';
import { intervalPolylines } from './perimeters.mjs';
import { COLORS, DASH, dimension, dimensionTo, esc, grid, n, polyline, svgDocument, viewport } from './svg.mjs';
import { headOutline } from './head-drawing.mjs';

// Label position along a path: a fixed fraction of a closed path (labels of different perimeters
// do not stack), or the middle of the first effective interval of a clipped one.
function firstEffective(model, r, fraction = 0) {
  const geometry = model?.intervalsAt(r);
  const item = geometry?.intervals[0];
  if (!item) return 0;
  return item.closed ? fraction * geometry.u : (item.s0 + item.s1) / 2;
}

function governingGap(result) {
  const check = result.loads?.find(load => load.name === result.governing?.load)?.layoutCheck;
  if (!check) return null;
  const worst = check.layerRows.reduce((best, entry) => (!best || (entry.tangential.ur ?? 0) > (best.tangential.ur ?? 0) ? entry : best), null);
  if (!worst) return null;
  const gap = worst.layer.tangential.gaps.reduce((a, b) => (b.length > a.length ? b : a));
  return { layer: worst.layer, gap, fails: worst.tangential.status === 'Fail' };
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
  const outerOnly = head?.kind === 'large' && !head.inner;
  const headReach = head ? Math.max(...head.lH) + 2 * head.d : 0;
  const reach = Math.max(u1Offset, aOut, headReach, ...layers.map(layer => layer.offset), 0);
  const legendHeight = 40;
  const extent = pathExtent(column, reach);
  const margin = Math.max(160, 0.16 * Math.max(extent.xMax - extent.xMin, extent.yMax - extent.yMin));
  const bounds = { xMin: extent.xMin - margin, xMax: extent.xMax + margin, yMin: extent.yMin - 1.8 * margin, yMax: extent.yMax + 0.6 * margin }; // room below for dimension rows
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
  const perimeter = (r, color, dash, width = 1.4) => {
    const out = [polyline(pathPolyline(pathColumn, r), view, `fill="none" stroke="${COLORS.rule}" stroke-width=".8" stroke-dasharray="1 3"`)];
    const intervals = model ? model.intervalsAt(r).intervals : [{ s0: 0, s1: 0, closed: true }];
    const lines = model ? intervalPolylines(model, r, intervals) : [pathPolyline(pathColumn, r)];
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
  if (aOut > 0) {
    parts.push(perimeter(aOut, COLORS.uout, DASH.uout, 1));
    parts.push(labelAt(aOut, 'u_out,ef', COLORS.uout, firstEffective(model, aOut, 0.16)));
  }
  if (head) parts.push(headOutline(input, view));
  if (ext) {
    parts.push(polyline(pathPolyline(ext.model.column, 2 * head.d), view, `fill="none" stroke="${COLORS.ink}" stroke-width="1.1" stroke-dasharray="${DASH.ext}"`, true));
    const p = toGlobal(ext.model.column, pointAt(ext.model.column, 2 * head.d, 0.09 * ext.u1));
    parts.push(`<text class="label" x="${n(view.x(p.x) + 4)}" y="${n(view.y(p.y) - 4)}">u1,ext (2d from drop)</text>`);
  }
  if (d > 0) {
    parts.push(perimeter(u1Offset, COLORS.u1, DASH.u1, 1.3));
    const u1Label = toGlobal(pathColumn, pointAt(pathColumn, u1Offset, firstEffective(model, u1Offset, head?.kind === 'small' ? 0.1 : 0.3)));
    const name = outerOnly ? 'u1,ext (2d from drop)' : head?.kind === 'large' ? 'u1,int (d_H)' : head?.kind === 'small' ? `u1 at r_cont (${head.rcont.eq})` : 'u1 (2d)';
    parts.push(`<text class="label" x="${n(view.x(u1Label.x) + 4)}" y="${n(view.y(u1Label.y) - 5)}">${esc(name)}</text>`);
  }
  for (const [index, layer] of layers.entries()) {
    parts.push(perimeter(layer.offset, COLORS.muted, DASH.layer, 0.6));
    const p = toGlobal(pathColumn, pointAt(pathColumn, layer.offset, firstEffective(model, layer.offset, 0.42)));
    if (index === 0 || index === layers.length - 1) parts.push(`<text class="small" x="${n(view.x(p.x) - 6)}" y="${n(view.y(p.y) - 6)}" text-anchor="end">L${index + 1}</text>`);
  }
  const gov = governingGap(result);
  if (gov) {
    const points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) points.push(toGlobal(pathColumn, pointAt(pathColumn, gov.layer.offset, gov.gap.s0 + (gov.gap.length * i) / steps)));
    parts.push(polyline(points, view, `fill="none" stroke="${gov.fails ? COLORS.ink : COLORS.governing}" stroke-width="4" stroke-opacity=".75" stroke-linecap="round"${gov.fails ? ' stroke-dasharray="6 3"' : ''} data-governing="${esc(gov.layer.id)}"`));
  }
  const outline = column.shape === 'circular' ? pathPolyline(column, 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: sx * column.cx / 2, y: sy * column.cy / 2 }));
  parts.push(polyline(outline, view, `fill="url(#concrete)" stroke="${COLORS.ink}" stroke-width="1.6"`, true));
  const reachLine = reach + 0.6 * margin;
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    const a = toGlobal(column, { x: -ax * reachLine, y: -ay * reachLine });
    const b = toGlobal(column, { x: ax * reachLine, y: ay * reachLine });
    parts.push(`<line x1="${n(view.x(a.x))}" y1="${n(view.y(a.y))}" x2="${n(view.x(b.x))}" y2="${n(view.y(b.y))}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);
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
  parts.push(planDimensions(column, view, d, aOut, layers, result.position, u1Offset, head));
  parts.push(axes(height - legendHeight, column));
  parts.push(legend(width, height, legendHeight, { ineffective: (result.layout?.links ?? []).some(link => link.legs.some(leg => !leg.effective)), ext: Boolean(ext), out: aOut > 0, head: Boolean(head), gap: layers.length > 0 }));
  return svgDocument(width, height, 'Punching shear plan', parts.join(''));
}

function planDimensions(column, view, d, aOut, layers, position, u1Offset = 2 * d, head = null) {
  const at = (x, y) => { const p = toGlobal(column, { x, y }); return [view.x(p.x), view.y(p.y)]; };
  // Radial chains along the local axis that points into the slab (edge and corner columns).
  const normal = position?.normals?.[0];
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const localNormal = normal ? { x: normal.x * Math.cos(theta) + normal.y * Math.sin(theta), y: -normal.x * Math.sin(theta) + normal.y * Math.cos(theta) } : { x: 1, y: 0 };
  const alongX = Math.abs(localNormal.x) > 0.5;
  const sign = alongX ? Math.sign(localNormal.x) : Math.sign(localNormal.y);
  const P = (t, side) => (alongX ? at(sign * t, side) : at(side, sign * t));
  const out = [];
  const circular = column.shape === 'circular';
  if (circular) {
    const r = column.diameter / 2;
    out.push(dimension(...at(-r, r), ...at(r, r), `D = ${column.diameter}`, -14));
  } else {
    const a = column.cx / 2;
    const b = column.cy / 2;
    out.push(dimension(...at(-a, b), ...at(a, b), `c_x = ${column.cx}`, -14));
    out.push(dimension(...at(-a, -b), ...at(-a, b), `c_y = ${column.cy}`, -14));
  }
  const face = circular ? column.diameter / 2 : alongX ? column.cx / 2 : column.cy / 2;
  const sideHalf = circular ? column.diameter / 2 : alongX ? column.cy / 2 : column.cx / 2;
  const px = 1 / view.scale; // mm per px
  // Layer chain just beyond the column side face: a1, then the radial spacings.
  // Rows below the drawing, measured from the column face to the tangent points of each perimeter.
  const lH = head ? (alongX ? head.lH[0] : head.lH.at(-1)) : 0;
  const rows = [];
  if (head?.kind === 'small') rows.push([head.rcont.r - face, `r_cont = ${head.rcont.r.toFixed(0)}`, -face]);
  else if (d > 0 && !(head?.kind === 'large' && !head.inner)) rows.push([u1Offset, `${head?.kind === 'large' ? '2d_H' : '2d'} = ${u1Offset.toFixed(0)}`]);
  if (aOut > 0) rows.push([aOut, `a_out = ${aOut.toFixed(0)}`]);
  if (head) rows.push([lH, `l_H = ${lH.toFixed(0)}`]);
  if (head?.kind === 'large') rows.push([lH + 2 * head.d, `l_H + 2d = ${(lH + 2 * head.d).toFixed(0)}`]);
  const reach = Math.max(...rows.map(([r]) => r), ...layers.map(layer => layer.offset), 0);
  // Layer chain above the drawing: a1 and the radial spacings, extension lines from the legs on the axis.
  if (layers.length) {
    const line = sideHalf + reach + 18 * px;
    let previous = 0;
    layers.forEach(layer => {
      out.push(dimensionTo(P(face + previous, previous ? 0 : sideHalf), P(face + layer.offset, 0), P(face + previous, line), P(face + layer.offset, line), (layer.offset - previous).toFixed(0)));
      previous = layer.offset;
    });
  }
  rows.sort((a, b) => a[0] - b[0]).forEach(([r, text, start = 0], k) => {
    const line = -(sideHalf + reach) - (18 + 16 * k) * px;
    const feature = r === lH && head ? -sideHalf - (alongX ? head.lH.at(-1) : head.lH[0]) : start ? 0 : -sideHalf;
    out.push(dimensionTo(P(face + start, start ? -sideHalf : -sideHalf), P(face + r, feature), P(face + start, line), P(face + r, line), text));
  });
  return out.join('');
}

function axes(bottom, column) {
  const x0 = 18;
  const y0 = bottom - 14;
  return `<g stroke="${COLORS.ink}" stroke-width="1.2"><line x1="${x0}" y1="${y0}" x2="${x0 + 34}" y2="${y0}"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - 34}"/>`
    + `<path d="M${x0 + 34} ${y0}l-6 -3v6z" fill="${COLORS.ink}"/><path d="M${x0} ${y0 - 34}l-3 6h6z" fill="${COLORS.ink}"/></g>`
    + `<text x="${x0 + 38}" y="${y0 + 4}">X</text><text x="${x0 - 4}" y="${y0 - 38}">Y</text>`
    + `<text class="small" x="${x0 + 60}" y="${y0 + 4}">Column centre (${column.x}, ${column.y}) mm · rotation ${column.rotation}°</text>`;
}

function legend(width, height, legendHeight, show) {
  const y = height - legendHeight + 16;
  const entries = [
    [true, `<circle cx="5" cy="0" r="4" fill="${COLORS.link}"/>`, 'Shear link leg'],
    [show.ineffective, `<circle cx="5" cy="0" r="4" fill="white" stroke="${COLORS.muted}"/><path d="M2 -3L8 3M2 3L8 -3" stroke="${COLORS.muted}"/>`, 'Ineffective leg'],
    [true, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.u1}" stroke-width="1.3"/>`, 'u1'],
    [show.ext, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.ext}"/>`, 'u1,ext'],
    [show.out, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.uout}"/>`, 'u_out,ef'],
    [show.head, `<line x1="0" y1="0" x2="14" y2="0" stroke="${COLORS.ink}" stroke-dasharray="${DASH.hidden}"/>`, 'Drop (below)'],
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
    + `<text class="small" x="14" y="${y + 18}">Dimensions in mm. Layer offsets measured from the column face.</text>`;
}
