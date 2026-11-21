// Half section A–A through the column along its local x-axis, drawn on the interior side (the side
// with more slab) with a break line beyond the column on the other side. True scale, CAD line types,
// dimensions below the section with extension lines from the features. Link legs of a layer need not
// lie in the cutting plane; they are drawn at their offsets. Bottom bars are schematic. Returns an SVG
// string whose height follows the content (width is fixed).
import { derivedSection } from './inputs.mjs';
import { COLORS, DASH, callout, esc, n, svgDocument } from './svg.mjs';

const BREAK = (x, y0, y1) => {
  const m = (y0 + y1) / 2;
  return `<path d="M${n(x)} ${n(y0 - 6)}L${n(x)} ${n(m - 6)}L${n(x - 5)} ${n(m - 2)}L${n(x + 5)} ${n(m + 2)}L${n(x)} ${n(m + 6)}L${n(x)} ${n(y1 + 6)}" fill="none" stroke="${COLORS.ink}" stroke-width=".7"/>`;
};

export function sectionSvg(result, { width = 640 } = {}) {
  const input = result.input;
  const { column, slab, flexure } = input;
  const h = slab.h;
  const layers = result.layout?.layers ?? [];
  const d = result.section?.d ?? 0;
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const face = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const head = result.head;
  const hH = head ? head.hH : 0;
  const lH = head ? head.lH[0] : 0;
  const u1Offset = head?.kind === 'small' ? head.rcont.r - face : result.u1Offset ?? 2 * d;
  const extOffset = head?.kind === 'large' ? lH + 2 * head.d : null;
  const reach = Math.max(u1Offset, aOut, extOffset ?? 0, lH, ...layers.map(layer => layer.offset), 0);

  // Distance from the column centre to the slab boundary along local ±x.
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const toEdge = sign => {
    const dx = sign * Math.cos(theta);
    const dy = sign * Math.sin(theta);
    const hits = [];
    if (Math.abs(dx) > 1e-12) hits.push(((dx > 0 ? slab.xMax : slab.xMin) - column.x) / dx);
    if (Math.abs(dy) > 1e-12) hits.push(((dy > 0 ? slab.yMax : slab.yMin) - column.y) / dy);
    return Math.min(...hits);
  };
  const side = toEdge(1) >= toEdge(-1) ? 1 : -1; // drawn to the right
  const span = face + reach + Math.max(200, 0.12 * reach);
  const right = Math.min(span, toEdge(side));
  const freeRight = right < span - 1e-6;
  const backEdge = toEdge(-side);
  const left = -Math.min(face + 250, backEdge);
  const freeLeft = backEdge <= face + 250;

  // Vertical extent and scale.
  const stub0 = Math.min(300, 1.2 * h);
  const rows = [];
  if (layers.length) rows.push(['chain']);
  if (head?.kind === 'small') rows.push(['r', u1Offset, `r_cont = ${head.rcont.r.toFixed(0)}`, -face]);
  else if (d > 0 && !(head?.kind === 'large' && !head.inner)) rows.push(['r', u1Offset, `${head?.kind === 'large' ? '2d_H' : '2d'} = ${u1Offset.toFixed(0)}`, 0]);
  if (head) rows.push(['r', lH, `l_H = ${lH.toFixed(0)}`, 0]);
  if (extOffset !== null) rows.push(['r', extOffset, `l_H + 2d = ${extOffset.toFixed(0)}`, 0]);
  if (aOut > 0) rows.push(['r', aOut, `a_out = ${aOut.toFixed(0)}`, 0]);
  rows.sort((r1, r2) => (r1[0] === 'chain' ? -1 : r2[0] === 'chain' ? 1 : r1[1] - r2[1]));
  const padL = 54;
  const padR = 64;
  const scale = (width - padL - padR) / (right - left);
  const stub = Math.min(stub0, 70 / scale); // column stubs at most 70 px
  const zTop = h + stub;
  const zBot = -hH - stub;
  const topPad = 96;
  const bodyHeight = (zTop - zBot) * scale;
  const dimsHeight = 12;
  const legendHeight = 58;
  const height = Math.round(topPad + bodyHeight + dimsHeight + legendHeight);
  const drawHeight = height - legendHeight;
  const X = t => padL + (t - left) * scale;
  const Z = z => topPad + (zTop - z) * scale;
  const soffit = t => (head && Math.abs(t) <= face + lH + 1e-9 ? -hH : 0);
  const parts = [`<defs><pattern id="sec-concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="white"/><line x1="0" y1="0" x2="0" y2="7" stroke="#9aa0a6" stroke-width=".5"/></pattern></defs>`];

  // Grid (100 / 500 mm) in model space.
  for (const [step, color] of [[100, COLORS.gridMinor], [500, COLORS.gridMajor]]) {
    if (step * scale < 4) continue;
    for (let t = Math.ceil((left - padL / scale) / step) * step; X(t) <= width; t += step) parts.push(`<line x1="${n(X(t))}" y1="0" x2="${n(X(t))}" y2="${n(drawHeight)}" stroke="${color}" stroke-width=".6"/>`);
    for (let z = Math.floor((zTop + topPad / scale) / step) * step; Z(z) <= drawHeight; z -= step) parts.push(`<line x1="0" y1="${n(Z(z))}" x2="${width}" y2="${n(Z(z))}" stroke="${color}" stroke-width=".6"/>`);
  }

  // Concrete: one monolithic body (slab, drop, column stubs). Boundaries are stroked separately so
  // that no line crosses the column–drop joint; cut ends get break lines.
  const dropEnd = Math.min(face + lH, right);
  const leftSoffit = soffit(left);
  const P = (t, z) => n(X(t)) + ' ' + n(Z(z));
  const body = [[left, h], [-face, h], [-face, zTop], [face, zTop], [face, h], [right, h], [right, 0]];
  if (head) body.push([dropEnd, 0], [dropEnd, -hH]);
  body.push([face, -hH], [face, zBot], [-face, zBot], [-face, -hH], [left, leftSoffit]);
  parts.push(`<path d="M${body.map(([t, z]) => P(t, z)).join('L')}Z" fill="url(#sec-concrete)" stroke="none"/>`);
  const edges = [
    `M${P(left, h)}L${P(-face, h)}L${P(-face, zTop)}`,
    `M${P(face, zTop)}L${P(face, h)}L${P(right, h)}${freeRight ? `L${P(right, 0)}` : ''}`,
    head ? `M${P(right, 0)}L${P(dropEnd, 0)}L${P(dropEnd, -hH)}L${P(face, -hH)}L${P(face, zBot)}` : `M${P(right, 0)}L${P(face, 0)}L${P(face, zBot)}`,
    `M${P(-face, zBot)}L${P(-face, -hH)}L${P(left, leftSoffit)}${freeLeft ? `L${P(left, h)}` : ''}`,
  ];
  parts.push(`<path d="${edges.join('')}" fill="none" stroke="${COLORS.ink}" stroke-width="1.4" stroke-linejoin="miter"/>`);
  if (!freeLeft) parts.push(BREAK(X(left), Z(h), Z(leftSoffit)));
  if (!freeRight) parts.push(BREAK(X(right), Z(h), Z(0)));
  for (const z of [zTop, zBot]) parts.push(`<path d="M${n(X(-face) - 6)} ${n(Z(z))}H${n(X(0) - 5)}l4 -5l2 10l4 -5H${n(X(face) + 6)}" fill="none" stroke="${COLORS.ink}" stroke-width=".7"/>`);
  parts.push(`<line x1="${n(X(0))}" y1="${n(Z(zTop) - 8)}" x2="${n(X(0))}" y2="${n(Z(zBot) + 8)}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);
  if (freeRight) parts.push(`<text class="small" x="${n(X(right))}" y="${n(Z(h) - 6)}" text-anchor="end">FREE EDGE</text>`);
  if (freeLeft && backEdge > face + 1) parts.push(`<text class="small" x="${n(X(left))}" y="${n(Z(h) - 6)}">FREE EDGE</text>`);

  // Reinforcement (light grey): top mat from the effective depths; slab bottom bars cranked down
  // along the drop edge and continued along the drop soffit (schematic); column bars run through.
  const cover = slab.cover || 25;
  let section = null;
  try { section = derivedSection(input); } catch { section = null; }
  const bar = COLORS.bar;
  const dot = (t, z, r) => `<circle cx="${n(X(t))}" cy="${n(Z(z))}" r="${n(r)}" fill="${bar}"/>`;
  const spacing = flexure.areaMode === 'bars' && flexure.sY > 0 ? flexure.sY : 150;
  const zTopBar = section ? section.dx : h - cover - 8;
  const zTopDots = section ? section.dy : h - cover - 20;
  const barWidth = 1.2; // all flexural bars (top, bottom, drop, column) share one line style
  parts.push(`<line x1="${n(X(left) + 3)}" y1="${n(Z(zTopBar))}" x2="${n(X(right) - 3)}" y2="${n(Z(zTopBar))}" stroke="${bar}" stroke-width="${barWidth}"/>`);
  for (let t = Math.ceil((left + 30) / spacing) * spacing; t <= right - 30; t += spacing) parts.push(dot(t, zTopDots, 1.6));
  const bottomBar = t => soffit(t) + cover + 6;
  const zb = cover + 6;
  const zbDrop = -hH + cover + 6;
  const xDropBar = Math.min(face + lH - cover - 6, right);
  const profile = head
    ? [[right - 3 / scale, zb], [xDropBar, zb], [xDropBar, zbDrop], [left + 3 / scale, zbDrop]]
    : [[right - 3 / scale, zb], [left + 3 / scale, zb]];
  parts.push(`<path d="M${profile.map(([t, z]) => P(t, z)).join('L')}" fill="none" stroke="${bar}" stroke-width="${barWidth}"/>`);
  for (let t = Math.ceil((left + 30) / 200) * 200; t <= right - 30; t += 200) {
    if (head && Math.abs(t - xDropBar) < 40) continue;
    parts.push(dot(t, bottomBar(t) + 8, 1.5));
  }
  for (const sign of [-1, 1]) {
    const t = sign * (face - cover - 10);
    parts.push(`<line x1="${n(X(t))}" y1="${n(Z(zBot))}" x2="${n(X(t))}" y2="${n(Z(zTop))}" stroke="${bar}" stroke-width="${barWidth}"/>`);
  }

  // Link legs with 135° hooks around the top and bottom bars (bends dashed: anchorage to confirm).
  const legTop = Math.max(zTopBar, zTopDots) + 6;
  layers.forEach((layer, index) => {
    const t = face + layer.offset;
    if (t > right) return;
    const x = X(t);
    const yTop = Z(legTop);
    const yBot = Z(bottomBar(t) - 6);
    const w = Math.max(2, layer.diameter * scale);
    const hook = 5;
    const red = COLORS.link;
    parts.push(`<g data-layer="L${index + 1}"><line x1="${n(x)}" y1="${n(yTop)}" x2="${n(x)}" y2="${n(yBot)}" stroke="${red}" stroke-width="${n(w)}"/>`
      + `<path d="M${n(x)} ${n(yTop)}a${hook} ${hook} 0 0 1 ${2 * hook} 0l4 6" fill="none" stroke="${red}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<path d="M${n(x)} ${n(yBot)}a${hook} ${hook} 0 0 0 ${2 * hook} 0l4 -6" fill="none" stroke="${red}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<text class="small" x="${n(x + 4)}" y="${n((yTop + yBot) / 2 + 3)}" fill="${red}">L${index + 1}</text></g>`);
  });

  // Control sections: vertical markers with labels staggered over two rows.
  const markers = [];
  if (d > 0 && !(head?.kind === 'large' && !head.inner)) markers.push([u1Offset, head?.kind === 'large' ? 'u1,int' : 'u1', DASH.u1]);
  if (extOffset !== null) markers.push([extOffset, 'u1,ext', DASH.ext]);
  if (aOut > 0) markers.push([aOut, 'u_out,ef', DASH.uout]);
  markers.sort((m1, m2) => m1[0] - m2[0]);
  let lastEnd = -Infinity;
  let row = 1;
  for (const [offset, text, dash] of markers) {
    const t = face + offset;
    if (t > right) continue;
    const x = X(t);
    row = x < lastEnd + 4 ? 1 - row : 0;
    const y = Z(h) - 10 - row * 15;
    parts.push(`<line x1="${n(x)}" y1="${n(y + 3)}" x2="${n(x)}" y2="${n(Z(soffit(t)) + 8)}" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${dash}"/><text class="label" x="${n(x + 3)}" y="${n(y)}">${esc(text)}</text>`);
    lastEnd = Math.max(lastEnd, x + 3 + text.length * 6.6);
  }

  // Key dimensions as text (no dimension lines): layer offsets, control sections, depths.
  const values = [];
  if (layers.length) {
    values.push(`a1 = ${layers[0].offset.toFixed(0)}`);
    const radial = [...new Set(layers.slice(1).map((layer, i) => (layer.offset - layers[i].offset).toFixed(0)))];
    if (radial.length) values.push(`s_r = ${radial.join(' / ')}`);
  }
  for (const item of rows) if (item[0] === 'r') values.push(item[2].includes('=') ? item[2] : `${item[2]} = ${item[1].toFixed(0)}`);
  values.push(`h = ${h}`);
  if (head) values.push(`h_H = ${hH}`);
  // Callouts (45° leaders, QLEADER style). A callout flips to the left when its text would leave
  // the drawing. Landings: links highest, top bars below them, bars under the soffit below the slab.
  const place = (x, y, dy, landing, lines, color) => {
    const run = Math.max(14, Math.abs(landing - y));
    const textWidth = Math.max(...lines.map(line => line.length)) * 6.2 + 10;
    const dx = x + run + textWidth > width - 4 ? -1 : 1;
    return callout(x, y, dx, dy, run, lines, color);
  };
  const lastLink = layers.length ? face + layers.at(-1).offset : face;
  if (layers.length) {
    const ids = layers.length > 1 ? `L1–L${layers.length}` : 'L1';
    const phis = [...new Set(layers.map(layer => layer.diameter))].map(phi => 'Ø' + phi).join('/');
    parts.push(place(X(face + layers[0].offset) + 2, Z(legTop) + 2, -1, Z(h) - 66, [`SHEAR LINKS ${ids}, ${phis}`, `${layers[0].shape === 'double' ? 'TWO-LEG' : 'SINGLE-LEG'}, SEE SCHEDULE`], COLORS.link));
  }
  // Top bars: from the right end of the drawing, leader up-left, landing below the link callout.
  parts.push(callout(X(right) - 14, Z(zTopBar), -1, -1, Math.max(14, Z(zTopBar) - (Z(h) - 40)), ['TOP BARS (FLEXURE INPUT)']));
  const under = Z(soffit(face)) + 16;
  if (head && dropEnd < right) {
    parts.push(place(X(xDropBar), Z((zb + zbDrop) / 2), 1, Z(-hH) + 18, ['DROP BARS, CRANKED', 'AT DROP EDGE (SCHEM.)']));
    const tb = dropEnd + 0.55 * (right - dropEnd);
    parts.push(place(X(tb), Z(zb), 1, Z(-hH) + 52, ['SLAB BOTTOM BARS', '(SCHEMATIC)']));
  } else {
    const tb = lastLink + 0.5 * Math.max(0, right - lastLink);
    parts.push(place(X(tb), Z(bottomBar(tb)), 1, under + 8, [head ? 'DROP / BOTTOM BARS (SCHEMATIC)' : 'BOTTOM BARS (SCHEMATIC)']));
  }
  parts.push(`<line x1="0" y1="${n(drawHeight)}" x2="${width}" y2="${n(drawHeight)}" stroke="${COLORS.rule}"/>`
    + `<text class="small" x="14" y="${n(drawHeight + 16)}">${esc(values.join(' · '))}</text>`
    + `<text class="small" x="14" y="${n(drawHeight + 31)}">Half section A–A, interior side${section ? ` · top bars d_x ${section.dx.toFixed(0)}, d_y ${section.dy.toFixed(0)}` : ''} · bottom bars schematic · legs at their offsets.</text>`
    + `<text class="small" x="14" y="${n(drawHeight + 46)}">Hook anchorage requires detailing confirmation (§8.5). Distances in mm from the column face.</text>`);
  return svgDocument(width, height, 'Punching shear section', parts.join(''));
}
