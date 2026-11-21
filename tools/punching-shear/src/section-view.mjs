// Section through the column along its local x-axis. Link layers are drawn at their offsets on both
// sides; legs of a layer need not lie in the cutting plane. Bends are dashed because anchorage is not
// checked by the tool. Returns an SVG string.
import { derivedSection } from './inputs.mjs';
import { COLORS, dimension, esc, n, svgDocument } from './svg.mjs';

export function sectionSvg(result, { width = 640, height = 330 } = {}) {
  const input = result.input;
  const { column, slab, flexure } = input;
  const h = slab.h;
  const layers = result.layout?.layers ?? [];
  const d = result.section?.d ?? 0;
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const face = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const reach = Math.max(2 * d, aOut, ...layers.map(layer => layer.offset), 0);
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
  const zMin = -1.6 * h;
  const zMax = h + 0.9 * h;
  const scale = Math.min((width - 90) / (2 * halfSpan), (drawHeight - 50) / (zMax - zMin));
  const X = x => width / 2 + x * scale;
  const Z = z => drawHeight - 22 - (z - zMin) * scale;
  const parts = [`<defs><pattern id="sec-concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${COLORS.concrete}"/><line x1="0" y1="0" x2="0" y2="7" stroke="#aab4b0" stroke-width=".7"/></pattern></defs>`];
  parts.push(`<rect x="${n(X(-limit[-1]))}" y="${n(Z(h))}" width="${n((limit[-1] + limit[1]) * scale)}" height="${n(h * scale)}" fill="${COLORS.slab}" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  for (const sign of [-1, 1]) if (limit[sign] < span - 1e-6) parts.push(`<text class="small" x="${n(X(sign * limit[sign]) + (sign > 0 ? 4 : -4))}" y="${n(Z(h / 2))}" text-anchor="${sign > 0 ? 'start' : 'end'}">Free edge</text>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(0))}" width="${n(2 * face * scale)}" height="${n((0 - zMin) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(zMax))}" width="${n(2 * face * scale)}" height="${n((zMax - h) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);

  let bars = null;
  try {
    const section = derivedSection(input);
    const outerX = flexure.outer !== 'y';
    const zx = h - (h - section.dx);
    const zy = h - (h - section.dy);
    bars = { zx, zy, outerX };
    parts.push(`<line x1="${n(X(-limit[-1] + 20))}" y1="${n(Z(zx))}" x2="${n(X(limit[1] - 20))}" y2="${n(Z(zx))}" stroke="${COLORS.steel}" stroke-width="${n(Math.max(1.2, flexure.phiX * scale))}"/>`);
    const spacing = flexure.areaMode === 'bars' && flexure.sY > 0 ? flexure.sY : 150;
    for (let x = -Math.floor((limit[-1] - 20) / spacing) * spacing; x <= limit[1] - 20; x += spacing) {
      parts.push(`<circle cx="${n(X(x))}" cy="${n(Z(zy))}" r="${n(Math.max(1.6, (flexure.phiY / 2) * scale))}" fill="${COLORS.steel}"/>`);
    }
    parts.push(`<text class="small" x="${n(X(-limit[-1]) + 4)}" y="${n(Z(h) - 4)}">Top reinforcement: d_x = ${section.dx.toFixed(0)}, d_y = ${section.dy.toFixed(0)} mm${flexure.areaMode === 'bars' ? '' : ' (bar spacing schematic)'}</text>`);
  } catch { bars = null; }

  const cover = slab.cover || 25;
  const top = bars ? Math.max(bars.zx, bars.zy) : h - cover;
  for (const [index, layer] of layers.entries()) {
    for (const side of [-1, 1]) {
      if (face + layer.offset > limit[side]) continue;
      const x = X(side * (face + layer.offset));
      const w = Math.max(1.5, layer.diameter * scale);
      const zTop = Z(top);
      const zBot = Z(cover);
      const hook = 6;
      parts.push(`<g data-layer="L${index + 1}"><line x1="${n(x)}" y1="${n(zTop)}" x2="${n(x)}" y2="${n(zBot)}" stroke="${COLORS.steel}" stroke-width="${n(w)}"/>`
        + `<path d="M${n(x)} ${n(zTop)}a${hook} ${hook} 0 0 ${side > 0 ? 1 : 0} ${n(side * 2 * hook)} 0" fill="none" stroke="${COLORS.steel}" stroke-width="1.2" stroke-dasharray="2 2"/>`
        + `<path d="M${n(x)} ${n(zBot)}h${n(side * 2 * hook)}" fill="none" stroke="${COLORS.steel}" stroke-width="1.2" stroke-dasharray="2 2"/></g>`);
    }
  }
  const marker = (offset, text, color) => {
    const x = X(side * (face + offset));
    return `<line x1="${n(x)}" y1="${n(Z(h) - 18)}" x2="${n(x)}" y2="${n(Z(0) + 8)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 3"/><text class="label" x="${n(x + 3)}" y="${n(Z(h) - 20)}" fill="${color}">${esc(text)}</text>`;
  };
  if (d > 0) parts.push(marker(2 * d, 'u1', COLORS.u1));
  if (aOut > 0) parts.push(marker(aOut, 'u_out,ef', COLORS.uout));

  const S = offset => X(side * (face + offset));
  parts.push(dimension(X(-side * limit[-side]) - side * 14, Z(0), X(-side * limit[-side]) - side * 14, Z(h), `h = ${h}`, 0));
  if (layers.length) {
    parts.push(dimension(S(0), Z(0) + 16, S(layers[0].offset), Z(0) + 16, `a1 = ${layers[0].offset.toFixed(0)}`, 0));
    if (layers.length > 1) parts.push(dimension(S(layers[0].offset), Z(0) + 34, S(layers[1].offset), Z(0) + 34, `s_r = ${(layers[1].offset - layers[0].offset).toFixed(0)}`, 0));
    const last = layers.at(-1).offset;
    if (aOut > last) parts.push(dimension(S(last), Z(0) + 52, S(aOut), Z(0) + 52, `${(aOut - last).toFixed(0)} (≤ 1.5d = ${(1.5 * d).toFixed(0)})`, 0));
    parts.push(`<text class="small" x="${n(S(last) + 6)}" y="${n(Z(cover) - 4)}">L${layers.length} outermost</text>`);
  }
  parts.push(dimension(X(side * limit[side]) + side * 14, Z(0), X(side * limit[side]) + side * 14, Z(cover), `c = ${cover}`, 0));
  parts.push(`<line x1="0" y1="${drawHeight}" x2="${width}" y2="${drawHeight}" stroke="${COLORS.rule}"/>`
    + `<text class="small" x="14" y="${drawHeight + 18}">Section along local x. Layers drawn at their offsets; legs need not lie in this plane. Dashed bends: anchorage requires detailing confirmation.</text>`);
  return svgDocument(width, height, 'Punching shear section', parts.join(''));
}
