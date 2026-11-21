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
  const halfSpan = face + reach + Math.max(150, 0.12 * reach);
  const legendHeight = 30;
  const drawHeight = height - legendHeight;
  const zMin = -1.6 * h;
  const zMax = h + 0.9 * h;
  const scale = Math.min((width - 90) / (2 * halfSpan), (drawHeight - 50) / (zMax - zMin));
  const X = x => width / 2 + x * scale;
  const Z = z => drawHeight - 22 - (z - zMin) * scale;
  const parts = [`<defs><pattern id="sec-concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${COLORS.concrete}"/><line x1="0" y1="0" x2="0" y2="7" stroke="#aab4b0" stroke-width=".7"/></pattern></defs>`];
  parts.push(`<rect x="${n(X(-halfSpan))}" y="${n(Z(h))}" width="${n(2 * halfSpan * scale)}" height="${n(h * scale)}" fill="${COLORS.slab}" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(0))}" width="${n(2 * face * scale)}" height="${n((0 - zMin) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  parts.push(`<rect x="${n(X(-face))}" y="${n(Z(zMax))}" width="${n(2 * face * scale)}" height="${n((zMax - h) * scale)}" fill="url(#sec-concrete)" stroke="${COLORS.ink}" stroke-width="1.4"/>`);

  let bars = null;
  try {
    const section = derivedSection(input);
    const outerX = flexure.outer !== 'y';
    const zx = h - (h - section.dx);
    const zy = h - (h - section.dy);
    bars = { zx, zy, outerX };
    parts.push(`<line x1="${n(X(-halfSpan))}" y1="${n(Z(zx))}" x2="${n(X(halfSpan))}" y2="${n(Z(zx))}" stroke="${COLORS.steel}" stroke-width="${n(Math.max(1.2, flexure.phiX * scale))}"/>`);
    const spacing = flexure.areaMode === 'bars' && flexure.sY > 0 ? flexure.sY : 150;
    for (let x = -Math.floor(halfSpan / spacing) * spacing; x <= halfSpan; x += spacing) {
      parts.push(`<circle cx="${n(X(x))}" cy="${n(Z(zy))}" r="${n(Math.max(1.6, (flexure.phiY / 2) * scale))}" fill="${COLORS.steel}"/>`);
    }
    parts.push(`<text class="small" x="${n(X(-halfSpan) + 4)}" y="${n(Z(h) - 4)}">Top reinforcement: d_x = ${section.dx.toFixed(0)}, d_y = ${section.dy.toFixed(0)} mm${flexure.areaMode === 'bars' ? '' : ' (bar spacing schematic)'}</text>`);
  } catch { bars = null; }

  const cover = slab.cover || 25;
  const top = bars ? Math.max(bars.zx, bars.zy) : h - cover;
  for (const [index, layer] of layers.entries()) {
    for (const side of [-1, 1]) {
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
    const x = X(face + offset);
    return `<line x1="${n(x)}" y1="${n(Z(h) - 18)}" x2="${n(x)}" y2="${n(Z(0) + 8)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 3"/><text class="label" x="${n(x + 3)}" y="${n(Z(h) - 20)}" fill="${color}">${esc(text)}</text>`;
  };
  if (d > 0) parts.push(marker(2 * d, 'u1', COLORS.u1));
  if (aOut > 0) parts.push(marker(aOut, 'u_out,ef', COLORS.uout));

  parts.push(dimension(X(-halfSpan) - 14, Z(0), X(-halfSpan) - 14, Z(h), `h = ${h}`, 0));
  if (layers.length) {
    parts.push(dimension(X(face), Z(0) + 16, X(face + layers[0].offset), Z(0) + 16, `a1 = ${layers[0].offset.toFixed(0)}`, 0));
    if (layers.length > 1) parts.push(dimension(X(face + layers[0].offset), Z(0) + 34, X(face + layers[1].offset), Z(0) + 34, `s_r = ${(layers[1].offset - layers[0].offset).toFixed(0)}`, 0));
    const last = layers.at(-1).offset;
    if (aOut > last) parts.push(dimension(X(face + last), Z(0) + 52, X(face + aOut), Z(0) + 52, `${(aOut - last).toFixed(0)} (≤ 1.5d = ${(1.5 * d).toFixed(0)})`, 0));
    parts.push(`<text class="small" x="${n(X(face + last) + 6)}" y="${n(Z(cover) - 4)}">L${layers.length} outermost</text>`);
  }
  parts.push(dimension(X(halfSpan) + 14, Z(0), X(halfSpan) + 14, Z(cover), `c = ${cover}`, 0));
  parts.push(`<line x1="0" y1="${drawHeight}" x2="${width}" y2="${drawHeight}" stroke="${COLORS.rule}"/>`
    + `<text class="small" x="14" y="${drawHeight + 18}">Section along local x. Layers drawn at their offsets; legs need not lie in this plane. Dashed bends: anchorage requires detailing confirmation.</text>`);
  return svgDocument(width, height, 'Punching shear section', parts.join(''));
}
