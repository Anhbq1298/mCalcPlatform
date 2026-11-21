// CAD-style plan of the connection: slab edges, openings, column, control perimeters, link layers,
// individual links and legs, and the governing tangential gap. Returns an SVG string.
import { pathExtent, pathPolyline, pointAt, toGlobal } from './geometry.mjs';
import { intervalPolylines } from './perimeters.mjs';
import { COLORS, dimension, esc, n, polyline, svgDocument, viewport } from './svg.mjs';

function firstEffective(model, r) {
  const item = model?.intervalsAt(r).intervals[0];
  return !item || item.closed ? 0 : (item.s0 + item.s1) / 2;
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
  const d = result.section?.d ?? 0;
  const layers = result.layout?.layers ?? [];
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const reach = Math.max(2 * d, aOut, ...layers.map(layer => layer.offset), 0);
  const legendHeight = 40;
  const extent = pathExtent(column, reach);
  const margin = Math.max(120, 0.08 * Math.max(extent.xMax - extent.xMin, extent.yMax - extent.yMin));
  const bounds = { xMin: extent.xMin - margin, xMax: extent.xMax + margin, yMin: extent.yMin - margin, yMax: extent.yMax + margin };
  const view = viewport(bounds, width, height - legendHeight);
  const parts = [];
  const { slab } = input;
  const clip = { x0: Math.max(slab.xMin, bounds.xMin), x1: Math.min(slab.xMax, bounds.xMax), y0: Math.max(slab.yMin, bounds.yMin), y1: Math.min(slab.yMax, bounds.yMax) };
  parts.push(`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${COLORS.opening}" stroke-width="1"/></pattern>`
    + `<pattern id="concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${COLORS.concrete}"/><line x1="0" y1="0" x2="0" y2="7" stroke="#aab4b0" stroke-width=".7"/></pattern></defs>`);
  if (clip.x0 < clip.x1 && clip.y0 < clip.y1) {
    parts.push(`<rect x="${n(view.x(clip.x0))}" y="${n(view.y(clip.y1))}" width="${n((clip.x1 - clip.x0) * view.scale)}" height="${n((clip.y1 - clip.y0) * view.scale)}" fill="${COLORS.slab}"/>`);
    for (const [key, x0, y0, x1, y1] of [['xMin', slab.xMin, clip.y0, slab.xMin, clip.y1], ['xMax', slab.xMax, clip.y0, slab.xMax, clip.y1], ['yMin', clip.x0, slab.yMin, clip.x1, slab.yMin], ['yMax', clip.x0, slab.yMax, clip.x1, slab.yMax]]) {
      const inside = key.startsWith('x') ? x0 >= bounds.xMin && x0 <= bounds.xMax : y0 >= bounds.yMin && y0 <= bounds.yMax;
      if (inside) parts.push(`<line x1="${n(view.x(x0))}" y1="${n(view.y(y0))}" x2="${n(view.x(x1))}" y2="${n(view.y(y1))}" stroke="${COLORS.ink}" stroke-width="2"/><text class="small" x="${n(view.x((x0 + x1) / 2) + 4)}" y="${n(view.y((y0 + y1) / 2) - 4)}">Slab edge</text>`);
    }
  }
  (input.openings || []).forEach((opening, index) => {
    const x = view.x(opening.x - opening.w / 2);
    const y = view.y(opening.y + opening.h / 2);
    parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(opening.w * view.scale)}" height="${n(opening.h * view.scale)}" fill="url(#hatch)" stroke="${COLORS.opening}" stroke-width="1.2"/><text class="label" x="${n(x + 3)}" y="${n(y - 4)}" fill="${COLORS.opening}">O${index + 1}</text>`);
  });
  const labelAt = (r, text, color, s = 0) => {
    const p = toGlobal(column, pointAt(column, r, s));
    return `<text class="label" x="${n(view.x(p.x) + 4)}" y="${n(view.y(p.y) - 4)}" fill="${color}">${esc(text)}</text>`;
  };
  const model = result.model;
  // Ineffective portions (outside the slab, in openings or opening shadows) are drawn faint.
  const perimeter = (r, color, dash, width = 1.4) => {
    const out = [polyline(pathPolyline(column, r), view, `fill="none" stroke="${COLORS.rule}" stroke-width=".8" stroke-dasharray="1 3"`)];
    const intervals = model ? model.intervalsAt(r).intervals : [{ s0: 0, s1: 0, closed: true }];
    const lines = model ? intervalPolylines(model, r, intervals) : [pathPolyline(column, r)];
    for (const line of lines) out.push(polyline(line, view, `fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}"`));
    return out.join('');
  };
  for (const shadow of result.shadows ?? []) {
    const r = reach + 200;
    for (const angle of [shadow.mid + shadow.low, shadow.mid + shadow.high]) {
      const end = { x: column.x + r * Math.cos(angle), y: column.y + r * Math.sin(angle) };
      parts.push(`<line x1="${n(view.x(column.x))}" y1="${n(view.y(column.y))}" x2="${n(view.x(end.x))}" y2="${n(view.y(end.y))}" stroke="${COLORS.opening}" stroke-width=".8" stroke-dasharray="4 3"/>`);
    }
  }
  if (aOut > 0) {
    parts.push(perimeter(aOut, COLORS.uout, '8 4'));
    parts.push(labelAt(aOut, 'u_out,ef', COLORS.uout, firstEffective(model, aOut)));
  }
  if (d > 0) {
    parts.push(perimeter(2 * d, COLORS.u1, '6 3'));
    const u1Label = toGlobal(column, pointAt(column, 2 * d, firstEffective(model, 2 * d)));
    parts.push(`<text class="label" x="${n(view.x(u1Label.x) + 4)}" y="${n(view.y(u1Label.y) + 13)}" fill="${COLORS.u1}">u1 (2d)</text>`);
  }
  for (const [index, layer] of layers.entries()) {
    parts.push(perimeter(layer.offset, COLORS.muted, '2 3', 0.7));
    const p = toGlobal(column, pointAt(column, layer.offset, firstEffective(model, layer.offset)));
    if (index === 0 || index === layers.length - 1) parts.push(`<text class="small" x="${n(view.x(p.x) - 6)}" y="${n(view.y(p.y) - 6)}" text-anchor="end">L${index + 1}</text>`);
  }
  const gov = governingGap(result);
  if (gov) {
    const points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) points.push(toGlobal(column, pointAt(column, gov.layer.offset, gov.gap.s0 + (gov.gap.length * i) / steps)));
    parts.push(polyline(points, view, `fill="none" stroke="${gov.fails ? COLORS.fail : COLORS.governing}" stroke-width="4" stroke-opacity=".75" stroke-linecap="round" data-governing="${esc(gov.layer.id)}"`));
  }
  const outline = column.shape === 'circular' ? pathPolyline(column, 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: sx * column.cx / 2, y: sy * column.cy / 2 }));
  parts.push(polyline(outline, view, `fill="url(#concrete)" stroke="${COLORS.ink}" stroke-width="1.6"`, true));
  for (const link of result.layout?.links ?? []) {
    const radius = Math.max(2.4, (link.diameter / 2) * view.scale);
    const isSelected = selected === link.id;
    let body = '';
    if (link.legs.length === 2) body += `<line x1="${n(view.x(link.legs[0].x))}" y1="${n(view.y(link.legs[0].y))}" x2="${n(view.x(link.legs[1].x))}" y2="${n(view.y(link.legs[1].y))}" stroke="${COLORS.steel}" stroke-width="1.4"/>`;
    for (const leg of link.legs) {
      const x = view.x(leg.x);
      const y = view.y(leg.y);
      body += leg.effective
        ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="${COLORS.steel}"/>`
        : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="white" stroke="${COLORS.fail}" stroke-width="1.2"/><path d="M${n(x - radius)} ${n(y - radius)}L${n(x + radius)} ${n(y + radius)}M${n(x - radius)} ${n(y + radius)}L${n(x + radius)} ${n(y - radius)}" stroke="${COLORS.fail}"/>`;
      if (isSelected) body += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(radius + 4)}" fill="none" stroke="${COLORS.governing}" stroke-width="2"/>`;
    }
    parts.push(`<g class="link" data-link="${esc(link.id)}"><title>${esc(link.id)} · Ø${link.diameter}</title>${body}</g>`);
  }
  parts.push(planDimensions(column, view, d, aOut, layers, result.position));
  parts.push(axes(height - legendHeight, column));
  parts.push(legend(width, height, legendHeight));
  return svgDocument(width, height, 'Punching shear plan', parts.join(''));
}

function planDimensions(column, view, d, aOut, layers, position) {
  const at = (x, y) => { const p = toGlobal(column, { x, y }); return [view.x(p.x), view.y(p.y)]; };
  // Chain along the local axis that points into the slab (edge and corner columns).
  const normal = position?.normals?.[0];
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const localNormal = normal ? { x: normal.x * Math.cos(theta) + normal.y * Math.sin(theta), y: -normal.x * Math.sin(theta) + normal.y * Math.cos(theta) } : { x: 1, y: 0 };
  const alongX = Math.abs(localNormal.x) > 0.5;
  const sign = alongX ? Math.sign(localNormal.x) : Math.sign(localNormal.y);
  const ray = (t, side = 0) => (alongX ? at(sign * t, side) : at(side, sign * t));
  const out = [];
  if (column.shape === 'circular') {
    const r = column.diameter / 2;
    out.push(dimension(...at(-r, r), ...at(r, r), `D = ${column.diameter}`, -14));
  } else {
    const a = column.cx / 2;
    const b = column.cy / 2;
    out.push(dimension(...at(-a, b), ...at(a, b), `cx = ${column.cx}`, -14));
    out.push(dimension(...at(-a, -b), ...at(-a, b), `cy = ${column.cy}`, -14));
  }
  const face = column.shape === 'circular' ? column.diameter / 2 : alongX ? column.cx / 2 : column.cy / 2;
  let previous = 0;
  layers.forEach((layer, index) => {
    if (index > 1) return;
    const text = index ? (layer.offset - previous).toFixed(0) : 'a1 = ' + layer.offset.toFixed(0);
    out.push(dimension(...ray(face + previous), ...ray(face + layer.offset), text, -12));
    previous = layer.offset;
  });
  if (d > 0) out.push(dimension(...ray(face), ...ray(face + 2 * d), `2d = ${(2 * d).toFixed(0)}`, 30));
  if (aOut > 0) out.push(dimension(...ray(face), ...ray(face + aOut), `a_out = ${aOut.toFixed(0)}`, 46));
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

function legend(width, height, legendHeight) {
  const y = height - legendHeight + 16;
  const item = (x, symbol, text) => `<g transform="translate(${x} ${y})">${symbol}<text class="small" x="16" y="4">${esc(text)}</text></g>`;
  return `<line x1="0" y1="${height - legendHeight}" x2="${width}" y2="${height - legendHeight}" stroke="${COLORS.rule}"/>`
    + item(14, `<circle cx="5" cy="0" r="4" fill="${COLORS.steel}"/>`, 'Effective leg')
    + item(108, `<circle cx="5" cy="0" r="4" fill="white" stroke="${COLORS.fail}"/>`, 'Ineffective leg')
    + item(214, `<line x1="0" y1="0" x2="12" y2="0" stroke="${COLORS.u1}" stroke-dasharray="4 2" stroke-width="1.4"/>`, 'u1 at 2d')
    + item(296, `<line x1="0" y1="0" x2="12" y2="0" stroke="${COLORS.uout}" stroke-dasharray="5 2" stroke-width="1.4"/>`, 'u_out,ef')
    + item(380, `<line x1="0" y1="0" x2="12" y2="0" stroke="${COLORS.governing}" stroke-width="4"/>`, 'Governing gap')
    + item(480, `<line x1="0" y1="0" x2="12" y2="0" stroke="${COLORS.rule}" stroke-dasharray="1 3"/>`, 'Ineffective')
    + `<text class="small" x="14" y="${y + 18}">Dimensions in mm. Layer offsets measured from the column face.</text>`;
}
