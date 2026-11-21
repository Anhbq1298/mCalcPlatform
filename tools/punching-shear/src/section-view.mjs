// Section through the column along its local x-axis. Link layers are drawn at their offsets on both
// sides; legs of a layer need not lie in the cutting plane. Bends are dashed because anchorage is not
// checked by the tool. Returns an SVG string.
import { derivedSection } from './inputs.mjs';
import { COLORS, DASH, dimensionTo, esc, n, svgDocument } from './svg.mjs';

export function sectionSvg(result, { width = 640, height = 330 } = {}) {
  const input = result.input;
  const { column, slab, flexure } = input;
  const h = slab.h;
  const layers = result.layout?.layers ?? [];
  const d = result.section?.d ?? 0;
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const face = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const head = result.head;
  const hH = head ? head.hH : 0;
  const headHalf = head ? face + head.lH[0] : face;
  const u1Offset = head?.kind === 'small' ? head.rcont.r - face : result.u1Offset ?? 2 * d;
  const extOffset = head?.kind === 'large' ? headHalf - face + 2 * head.d : null;
  const reach = Math.max(u1Offset, aOut, extOffset ?? 0, headHalf - face, ...layers.map(layer => layer.offset), 0);
  const span = face + reach + Math.max(150, 0.12 * reach);
  // Distance from the column centre to the slab boundary along local ±x (free edges end the slab).
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const toEdge = sign => {
    const dx = sign * Math.cos(theta);
    const dy = sign * Math.sin(theta);
    const hits = [];
    if (Math.abs(dx) > 1e-12) hits.push(((dx > 0 ? slab.xMax : slab.xMin) - column.x) / dx);
    if (Math.abs(dy) > 1e-12) hits.push(((dy > 0 ? slab.yMax : slab.yMin) - column.y) / dy);
    return Math.min(...hits);
  };
  const limit = { [-1]: Math.min(span, toEdge(-1)), [1]: Math.min(span, toEdge(1)) };
  const side = limit[1] >= limit[-1] ? 1 : -1; // interior side for markers and dimensions
  const halfSpan = span;
  const legendHeight = 30;
  const drawHeight = height - legendHeight;
  // Radial dimension rows below the section: layer chain, u1, l_H, u1,ext, a_out (interior side).
  const rows = [];
  if (layers.length) rows.push('chain');
  if (d > 0) rows.push(['u1', u1Offset, head?.kind === 'large' ? '2d_H' : head?.kind === 'small' ? 'r_cont − c/2' : '2d']);
  if (head) rows.push(['lH', headHalf - face, 'l_H']);
  if (extOffset !== null) rows.push(['ext', extOffset, 'l_H + 2d']);
  if (aOut > 0) rows.push(['out', aOut, 'a_out']);
  rows.sort((r1, r2) => (r1 === 'chain' ? -1 : r2 === 'chain' ? 1 : r1[1] - r2[1]));
  const topPad = 46;
  const bottomPad = 18 + 16 * rows.length;
  const zMin = -hH - 0.7 * h;
  const zMax = h + 0.6 * h;
  const scale = Math.min((width - 130) / (2 * halfSpan), (drawHeight - topPad - bottomPad) / (zMax - zMin));
  const X = x => width / 2 + x * scale;
  const Z = z => topPad + (zMax - z) * scale;
  const yBase = Z(zMin);
  const parts = [`<defs><pattern id="sec-concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="white"/><line x1="0" y1="0" x2="0" y2="7" stroke="#9aa0a6" stroke-width=".5"/></pattern></defs>`];
  for (const [step, color] of [[100, COLORS.gridMinor], [500, COLORS.gridMajor]]) {
    if (step * scale < 4) continue;
    for (let x = Math.ceil(-width / 2 / scale / step) * step; X(x) <= width; x += step) parts.push(`<line x1="${n(X(x))}" y1="0" x2="${n(X(x))}" y2="${drawHeight}" stroke="${color}" stroke-width=".6"/>`);
    for (let z = Math.floor(zMax / step + 2) * step; Z(z) <= drawHeight; z -= step) if (Z(z) >= 0) parts.push(`<line x1="0" y1="${n(Z(z))}" x2="${width}" y2="${n(Z(z))}" stroke="${color}" stroke-width=".6"/>`);
  }
  const a = Math.min(headHalf, limit[-1]);
  const b = Math.min(headHalf, limit[1]);
  const outline = head
    ? [[-limit[-1], h], [limit[1], h], [limit[1], 0], [b, 0], [b, -hH], [-a, -hH], [-a, 0], [-limit[-1], 0]]
    : [[-limit[-1], h], [limit[1], h], [limit[1], 0], [-limit[-1], 0]];
  parts.push(`<path d="${outline.map(([x, z], i) => (i ? 'L' : 'M') + n(X(x)) + ' ' + n(Z(z))).join('')}Z" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  for (const sign of [-1, 1]) if (limit[sign] < span - 1e-6) parts.push(`<text class="small" x="${n(X(sign * limit[sign]))}" y="${n(Z(h) - 8)}" text-anchor="${sign > 0 ? 'end' : 'start'}">FREE EDGE</text>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(-hH))}" width="${n(2 * face * scale)}" height="${n((-hH - zMin) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(zMax))}" width="${n(2 * face * scale)}" height="${n((zMax - h) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  parts.push(`<line x1="${n(X(0))}" y1="${n(Z(zMax) - 6)}" x2="${n(X(0))}" y2="${n(yBase + 6)}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);

  let bars = null;
  try {
    const section = derivedSection(input);
    bars = { zx: section.dx, zy: section.dy };
    parts.push(`<line x1="${n(X(-limit[-1] + 20))}" y1="${n(Z(bars.zx))}" x2="${n(X(limit[1] - 20))}" y2="${n(Z(bars.zx))}" stroke="${COLORS.steel}" stroke-width="${n(Math.max(1.2, flexure.phiX * scale))}"/>`);
    const spacing = flexure.areaMode === 'bars' && flexure.sY > 0 ? flexure.sY : 150;
    for (let x = -Math.floor((limit[-1] - 20) / spacing) * spacing; x <= limit[1] - 20; x += spacing) {
      parts.push(`<circle cx="${n(X(x))}" cy="${n(Z(bars.zy))}" r="${n(Math.max(1.6, (flexure.phiY / 2) * scale))}" fill="${COLORS.steel}"/>`);
    }
  } catch { bars = null; }

  const cover = slab.cover || 25;
  const top = bars ? Math.max(bars.zx, bars.zy) : h - cover;
  const soffit = offset => (face + offset <= headHalf + 1e-9 ? -hH : 0);
  for (const [index, layer] of layers.entries()) {
    for (const sign of [-1, 1]) {
      if (face + layer.offset > limit[sign]) continue;
      const x = X(sign * (face + layer.offset));
      const w = Math.max(1.5, layer.diameter * scale);
      const zTop = Z(top);
      const zBot = Z(cover + soffit(layer.offset));
      const hook = 6;
      parts.push(`<g data-layer="L${index + 1}"><line x1="${n(x)}" y1="${n(zTop)}" x2="${n(x)}" y2="${n(zBot)}" stroke="${COLORS.steel}" stroke-width="${n(w)}"/>`
        + `<path d="M${n(x)} ${n(zTop)}a${hook} ${hook} 0 0 ${sign > 0 ? 1 : 0} ${n(sign * 2 * hook)} 0" fill="none" stroke="${COLORS.steel}" stroke-width="1.2" stroke-dasharray="2 2"/>`
        + `<path d="M${n(x)} ${n(zBot)}h${n(sign * 2 * hook)}" fill="none" stroke="${COLORS.steel}" stroke-width="1.2" stroke-dasharray="2 2"/></g>`);
    }
  }
  // Control-section markers with labels staggered on two rows when they would collide.
  const markers = [];
  if (d > 0) markers.push([u1Offset, head?.kind === 'large' ? 'u1,int' : 'u1', DASH.u1]);
  if (extOffset !== null) markers.push([extOffset, 'u1,ext', DASH.ext]);
  if (aOut > 0) markers.push([aOut, 'u_out,ef', DASH.uout]);
  markers.sort((m1, m2) => m1[0] - m2[0]);
  let lastEnd = -Infinity;
  let row = 0;
  for (const [offset, text, dash] of markers) {
    const x = X(side * (face + offset));
    const start = side > 0 ? x : x - text.length * 6.8;
    row = Math.abs(start - lastEnd) < text.length * 6.8 + 6 || (side > 0 ? start < lastEnd : false) ? 1 - row : 0;
    const y = Z(h) - 10 - row * 14;
    parts.push(`<line x1="${n(x)}" y1="${n(y + 2)}" x2="${n(x)}" y2="${n(Z(soffit(offset)) + 6)}" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${dash}"/><text class="label" x="${n(x + 3 * side)}" y="${n(y)}" text-anchor="${side > 0 ? 'start' : 'end'}">${esc(text)}</text>`);
    lastEnd = side > 0 ? x + text.length * 6.8 + 3 : x - 3;
  }
  // Dimension rows: features on the soffit, dimension lines stacked below the drawing.
  const S = offset => X(side * (face + offset));
  rows.forEach((item, k) => {
    const y = yBase + 14 + 16 * k;
    if (item === 'chain') {
      let previous = 0;
      layers.forEach((layer, index) => {
        const text = (layer.offset - previous).toFixed(0);
        parts.push(dimensionTo([S(previous), Z(soffit(previous))], [S(layer.offset), Z(soffit(layer.offset) + cover)], [S(previous), y], [S(layer.offset), y], text));
        previous = layer.offset;
      });
      if (aOut > previous) parts.push(dimensionTo([S(previous), Z(soffit(previous) + cover)], [S(aOut), Z(soffit(aOut))], [S(previous), y], [S(aOut), y], (aOut - previous).toFixed(0)));
      return;
    }
    const [, offset, name] = item;
    parts.push(dimensionTo([S(0), Z(-hH)], [S(offset), Z(soffit(offset - 1e-6))], [S(0), y], [S(offset), y], `${name} = ${offset.toFixed(0)}`));
  });
  // Vertical dimensions on the far side: slab depth, drop depth and cover.
  const far = -side;
  const xEnd = X(far * limit[far]);
  parts.push(dimensionTo([xEnd, Z(0)], [xEnd, Z(h)], [xEnd + far * 16, Z(0)], [xEnd + far * 16, Z(h)], `h ${h}`));
  if (head) {
    const xd = X(far * a);
    parts.push(dimensionTo([xd, Z(-hH)], [xd, Z(0)], [xd + far * 16, Z(-hH)], [xd + far * 16, Z(0)], `h_H ${hH}`));
  }
  parts.push(`<line x1="0" y1="${drawHeight}" x2="${width}" y2="${drawHeight}" stroke="${COLORS.rule}"/>`
    + `<text class="small" x="14" y="${drawHeight + 18}">Section A–A along local x${bars ? ` · top bars d_x ${bars.zx.toFixed(0)}, d_y ${bars.zy.toFixed(0)} mm` : ''}. Legs need not lie in this plane; dashed bends: anchorage requires detailing confirmation.${head ? ' Links in the drop run to its soffit.' : ''}</text>`);
  return svgDocument(width, height, 'Punching shear section', parts.join(''));
}
