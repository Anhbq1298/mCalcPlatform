// Full section A–A through the column along its local x-axis. Each side runs to its free slab edge
// when that edge is within the drawing span, otherwise it ends at a break line. True scale, CAD line types,
// dimensions below the section with extension lines from the features. Link legs of a layer need not
// lie in the cutting plane; they are drawn at their offsets. Bottom bars are schematic. Returns an SVG
// string whose height follows the content (width is fixed).
import { derivedSection } from './inputs.mjs';
import { COLORS, DASH, callout, dimensionTo, esc, n, svgDocument } from './svg.mjs';

const BREAK = (x, y0, y1) => {
  const m = (y0 + y1) / 2;
  return `<path d="M${n(x)} ${n(y0 - 6)}L${n(x)} ${n(m - 6)}L${n(x - 5)} ${n(m - 2)}L${n(x + 5)} ${n(m + 2)}L${n(x)} ${n(m + 6)}L${n(x)} ${n(y1 + 6)}" fill="none" stroke="${COLORS.ink}" stroke-width=".7"/>`;
};

// axis 'x': Section A–A along the local x-axis; axis 'y': Section B–B along the local y-axis. Each
// uses the column size, drop extent, bar direction and slab edges of its own direction.
export function sectionSvg(result, { width = 640, axis = 'x' } = {}) {
  const alongY = axis === 'y';
  const name = alongY ? 'B–B' : 'A–A';
  const input = result.input;
  const { column, slab, flexure } = input;
  const h = slab.h;
  const layers = result.layout?.layers ?? [];
  const d = result.section?.d ?? 0;
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const face = column.shape === 'circular' ? column.diameter / 2 : (alongY ? column.cy : column.cx) / 2;
  const head = result.head;
  const hH = head ? head.hH : 0;
  // Drop extent from the column centre on the + and − side of the section axis (clipped to the slab).
  const posEnd = head ? (alongY ? head.extents.yMax : head.extents.xMax) : face;
  const negEnd = head ? -(alongY ? head.extents.yMin : head.extents.xMin) : face;
  const lH = posEnd - face;
  const lHneg = negEnd - face;
  const slabOnly = head && (head.kind === 'large' ? !head.inner : !head.rcont); // no section around the column
  const u1Offset = slabOnly ? null : head?.kind === 'small' ? head.rcont.r - face : result.u1Offset ?? 2 * d;
  const extOffset = head && (head.kind === 'large' || !head.rcont) ? lH + 2 * head.d : null;
  const extOffsetNeg = extOffset !== null ? lHneg + 2 * head.d : null;
  // Offsets measured from the loaded area of the solved section, converted to the column face: the
  // drop for slab-only sections, the equivalent circle for r_cont, the column otherwise.
  const loaded = sideLH => (!head ? 0 : head.kind === 'small' && head.rcont ? head.rcont.r - 2 * head.d - face : slabOnly ? sideLH : 0);
  const extAOut = head?.inner ? head.sections.find(item => item.id === 'ext')?.aOut ?? 0 : 0;
  const linkAt = (layer, sign) => sign * (layer.zone === 'slab' ? (sign > 0 ? posEnd : negEnd) + layer.pathOffset : face + layer.offset);
  const reach = Math.max(u1Offset ?? 0, aOut ? loaded(Math.max(lH, lHneg)) + aOut : 0, extAOut ? Math.max(lH, lHneg) + extAOut : 0, extOffset ?? 0, extOffsetNeg ?? 0, lH, lHneg, ...layers.flatMap(layer => [linkAt(layer, 1), -linkAt(layer, -1)].map(t => t - face)), 0);

  // Distance from the column centre to the slab boundary along the local section axis.
  const theta = ((column.rotation || 0) * Math.PI) / 180 + (alongY ? Math.PI / 2 : 0);
  const toEdge = sign => {
    const dx = sign * Math.cos(theta);
    const dy = sign * Math.sin(theta);
    const hits = [];
    if (Math.abs(dx) > 1e-12) hits.push(((dx > 0 ? slab.xMax : slab.xMin) - column.x) / dx);
    if (Math.abs(dy) > 1e-12) hits.push(((dy > 0 ? slab.yMax : slab.yMin) - column.y) / dy);
    return Math.min(...hits);
  };
  const side = 1; // true orientation: +local axis to the right
  const span = face + reach + Math.max(200, 0.12 * reach);
  const right = Math.min(span, toEdge(side));
  const freeRight = right < span - 1e-6;
  const backEdge = toEdge(-side);
  const left = -Math.min(span, backEdge); // full section: each side to its free edge or a break
  const freeLeft = backEdge <= span + 1e-6;

  // Vertical extent and scale.
  const stub0 = Math.min(300, 1.2 * h);
  const rows = [];
  if (layers.length) rows.push(['chain']);
  if (head?.kind === 'small' && head.rcont) rows.push(['r', u1Offset, `r_cont = ${head.rcont.r.toFixed(0)}`, -face]);
  else if (d > 0 && u1Offset !== null) rows.push(['r', u1Offset, `${head?.kind === 'large' ? '2d_H' : '2d'} = ${u1Offset.toFixed(0)}`, 0]);
  const lHshow = lH > 1 ? lH : lHneg; // the side where the drop projects (edge columns are flush on one side)
  if (head) rows.push(['r', lHshow, `l_H = ${lHshow.toFixed(0)}`, 0]);
  if (extOffset !== null) rows.push(['r', lHshow + 2 * head.d, `l_H + 2d = ${(lHshow + 2 * head.d).toFixed(0)}`, 0]);
  if (aOut > 0) rows.push(['r', aOut, `a_out = ${aOut.toFixed(0)}${head && !head.inner ? ' (from the loaded area)' : ''}`, 0]);
  if (extAOut > 0) rows.push(['r', extAOut, `a_out,ext = ${extAOut.toFixed(0)} (from the drop)`, 0]);
  rows.sort((r1, r2) => (r1[0] === 'chain' ? -1 : r2[0] === 'chain' ? 1 : r1[1] - r2[1]));
  const padL = 54;
  const padR = 64;
  const scale = (width - padL - padR) / (right - left);
  const stub = Math.min(stub0, 70 / scale); // column stubs at most 70 px
  const zTop = h + stub;
  const zBot = -hH - stub;
  const topPad = 96;
  const bodyHeight = (zTop - zBot) * scale;
  const dimsHeight = 40; // room for the drop callout landing below the column stub
  const legendHeight = 120; // symbol legend (up to two rows), up to three lines of values, two notes
  const height = Math.round(topPad + bodyHeight + dimsHeight + legendHeight);
  const drawHeight = height - legendHeight;
  const X = t => padL + (t - left) * scale;
  const Z = z => topPad + (zTop - z) * scale;
  const soffit = t => (head && t <= posEnd + 1e-9 && t >= -negEnd - 1e-9 ? -hH : 0);
  const parts = [`<defs><pattern id="sec-concrete" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="white"/><line x1="0" y1="0" x2="0" y2="7" stroke="#9aa0a6" stroke-width=".5"/></pattern></defs>`];

  // Grid (100 / 500 mm) in model space.
  for (const [step, color] of [[100, COLORS.gridMinor], [500, COLORS.gridMajor]]) {
    if (step * scale < 4) continue;
    for (let t = Math.ceil((left - padL / scale) / step) * step; X(t) <= width; t += step) parts.push(`<line x1="${n(X(t))}" y1="0" x2="${n(X(t))}" y2="${n(drawHeight)}" stroke="${color}" stroke-width=".6"/>`);
    for (let z = Math.floor((zTop + topPad / scale) / step) * step; Z(z) <= drawHeight; z -= step) parts.push(`<line x1="0" y1="${n(Z(z))}" x2="${width}" y2="${n(Z(z))}" stroke="${color}" stroke-width=".6"/>`);
  }

  // Concrete: one monolithic body (slab, drop, column stubs). Boundaries are stroked separately so
  // that no line crosses the column–drop joint; cut ends get break lines.
  const dropEnd = Math.min(posEnd, right);
  const dropEndL = Math.min(negEnd, -left); // drop edge on the other side
  const leftSoffit = soffit(left);
  const P = (t, z) => n(X(t)) + ' ' + n(Z(z));
  const body = [[left, h], [-face, h], [-face, zTop], [face, zTop], [face, h], [right, h], [right, 0]];
  if (head) body.push([dropEnd, 0], [dropEnd, -hH]);
  body.push([face, -hH], [face, zBot], [-face, zBot], [-face, -hH]);
  if (head && dropEndL < -left) body.push([-dropEndL, -hH], [-dropEndL, 0]);
  body.push([left, leftSoffit]);
  parts.push(`<path d="M${body.map(([t, z]) => P(t, z)).join('L')}Z" fill="url(#sec-concrete)" stroke="none"/>`);
  const edges = [
    `M${P(left, h)}L${P(-face, h)}L${P(-face, zTop)}`,
    `M${P(face, zTop)}L${P(face, h)}L${P(right, h)}${freeRight ? `L${P(right, 0)}` : ''}`,
    head ? `M${P(right, 0)}L${P(dropEnd, 0)}L${P(dropEnd, -hH)}L${P(face, -hH)}L${P(face, zBot)}` : `M${P(right, 0)}L${P(face, 0)}L${P(face, zBot)}`,
    `M${P(-face, zBot)}L${P(-face, -hH)}${head && dropEndL < -left ? `L${P(-dropEndL, -hH)}L${P(-dropEndL, 0)}` : ''}L${P(left, leftSoffit)}${freeLeft ? `L${P(left, h)}` : ''}`,
  ];
  parts.push(`<path d="${edges.join('')}" fill="none" stroke="${COLORS.ink}" stroke-width="1.4" stroke-linejoin="miter"/>`);
  if (!freeLeft) parts.push(BREAK(X(left), Z(h), Z(leftSoffit)));
  if (!freeRight) parts.push(BREAK(X(right), Z(h), Z(0)));
  for (const z of [zTop, zBot]) parts.push(`<path d="M${n(X(-face) - 6)} ${n(Z(z))}H${n(X(0) - 5)}l4 -5l2 10l4 -5H${n(X(face) + 6)}" fill="none" stroke="${COLORS.ink}" stroke-width=".7"/>`);
  parts.push(`<line x1="${n(X(0))}" y1="${n(Z(zTop) - 8)}" x2="${n(X(0))}" y2="${n(Z(zBot) + 8)}" stroke="${COLORS.muted}" stroke-width=".5" stroke-dasharray="${DASH.centre}"/>`);
  if (freeRight && right > face + 1) parts.push(`<text class="small" x="${n(X(right))}" y="${n(Z(h) - 6)}" text-anchor="end">FREE EDGE</text>`);
  if (freeLeft && backEdge > face + 1) parts.push(`<text class="small" x="${n(X(left))}" y="${n(Z(h) - 6)}">FREE EDGE</text>`);

  // Reinforcement (light grey): top mat from the effective depths; slab bottom bars cranked down
  // along the drop edge and continued along the drop soffit (schematic); column bars run through.
  const cover = slab.cover || 25;
  let section = null;
  try { section = derivedSection(input); } catch { section = null; }
  const bar = COLORS.bar;
  const dot = (t, z, r) => `<circle cx="${n(X(t))}" cy="${n(Z(z))}" r="${n(r)}" fill="${bar}"/>`;
  const spacing = flexure.areaMode === 'bars' && (alongY ? flexure.sX : flexure.sY) > 0 ? (alongY ? flexure.sX : flexure.sY) : 150;
  // Bars running along the section axis are drawn as a line, the perpendicular layer as dots.
  const zTopBar = section ? (alongY ? section.dy : section.dx) : h - cover - 8;
  const zTopDots = section ? (alongY ? section.dx : section.dy) : h - cover - 20;
  const barWidth = 1.2; // all flexural bars (top, bottom, drop, column) share one line style
  parts.push(`<line x1="${n(X(left) + 3)}" y1="${n(Z(zTopBar))}" x2="${n(X(right) - 3)}" y2="${n(Z(zTopBar))}" stroke="${bar}" stroke-width="${barWidth}"/>`);
  for (let t = Math.ceil((left + 30) / spacing) * spacing; t <= right - 30; t += spacing) parts.push(dot(t, zTopDots, 1.6));
  const bottomBar = t => soffit(t) + cover + 6;
  const zb = cover + 6;
  const zbDrop = -hH + cover + 6;
  const xDropBar = Math.min(posEnd - cover - 6, right);
  const xDropBarL = -Math.min(negEnd - cover - 6, -left);
  const profile = head
    ? [[right - 3 / scale, zb], [xDropBar, zb], [xDropBar, zbDrop], [xDropBarL, zbDrop], ...(dropEndL < -left ? [[xDropBarL, zb], [left + 3 / scale, zb]] : [])]
    : [[right - 3 / scale, zb], [left + 3 / scale, zb]];
  parts.push(`<path d="M${profile.map(([t, z]) => P(t, z)).join('L')}" fill="none" stroke="${bar}" stroke-width="${barWidth}"/>`);
  for (let t = Math.ceil((left + 30) / 200) * 200; t <= right - 30; t += 200) {
    if (head && (Math.abs(t - xDropBar) < 40 || Math.abs(t - xDropBarL) < 40)) continue;
    parts.push(dot(t, bottomBar(t) + 8, 1.5));
  }
  for (const sign of [-1, 1]) {
    const t = sign * (face - cover - 10);
    parts.push(`<line x1="${n(X(t))}" y1="${n(Z(zBot))}" x2="${n(X(t))}" y2="${n(Z(zTop))}" stroke="${bar}" stroke-width="${barWidth}"/>`);
  }

  // Link legs with 135° hooks around the top and bottom bars (bends dashed: anchorage to confirm).
  const legTop = Math.max(zTopBar, zTopDots) + 6;
  layers.forEach((layer, index) => [1, -1].forEach(sign => {
    const t = linkAt(layer, sign);
    if (t > right || t < left) return;
    const x = X(t);
    const yTop = Z(legTop);
    const yBot = Z(bottomBar(t) - 6);
    const w = Math.max(2, layer.diameter * scale);
    const hook = 5;
    const red = COLORS.link;
    parts.push(`<g data-layer="${esc(layer.id ?? 'L' + (index + 1))}"><line x1="${n(x)}" y1="${n(yTop)}" x2="${n(x)}" y2="${n(yBot)}" stroke="${red}" stroke-width="${n(w)}"/>`
      + `<path d="M${n(x)} ${n(yTop)}a${hook} ${hook} 0 0 ${sign > 0 ? 1 : 0} ${sign * 2 * hook} 0l${sign * 4} 6" fill="none" stroke="${red}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<path d="M${n(x)} ${n(yBot)}a${hook} ${hook} 0 0 ${sign > 0 ? 0 : 1} ${sign * 2 * hook} 0l${sign * 4} -6" fill="none" stroke="${red}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<text class="small" x="${n(x + 4 * sign)}" y="${n((yTop + yBot) / 2 + 3)}" text-anchor="${sign > 0 ? 'start' : 'end'}" fill="${red}">${esc(layer.id ?? 'L' + (index + 1))}</text></g>`);
  }));

  // Control sections: vertical markers with labels staggered over two rows.
  const markers = [];
  if (d > 0 && u1Offset !== null) markers.push([u1Offset, head?.kind === 'large' ? 'u1,int' : 'u1', DASH.u1]);
  if (extOffset !== null) markers.push([extOffset, 'u1,ext', DASH.ext, extOffsetNeg]);
  if (aOut > 0) markers.push([loaded(lH) + aOut, 'u_out,ef', DASH.uout, loaded(lHneg) + aOut]);
  if (extAOut > 0) markers.push([lH + extAOut, 'u_out,ef,ext', DASH.uout, lHneg + extAOut]);
  markers.sort((m1, m2) => m1[0] - m2[0]);
  let lastEnd = -Infinity;
  let row = 1;
  for (const [offset, text, dash, negOffset = offset] of markers) {
    const t = face + offset;
    const tn = face + negOffset;
    const x = X(t);
    row = x < lastEnd + 4 ? 1 - row : 0;
    const y = Z(h) - 10 - row * 15;
    if (t <= right) parts.push(`<line x1="${n(x)}" y1="${n(y + 3)}" x2="${n(x)}" y2="${n(Z(soffit(t)) + 8)}" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${dash}"/><text class="label" x="${n(x + 3)}" y="${n(y)}">${esc(text)}</text>`);
    lastEnd = Math.max(lastEnd, x + 3 + text.length * 6.6);
    if (-tn >= left) parts.push(`<line x1="${n(X(-tn))}" y1="${n(y + 3)}" x2="${n(X(-tn))}" y2="${n(Z(soffit(-tn)) + 8)}" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${dash}"/><text class="label" x="${n(X(-tn) - 3)}" y="${n(y)}" text-anchor="end">${esc(text)}</text>`);
  }

  // Depth dimensions: slab thickness at a slab end with a plain soffit; drop depth and total depth
  // at the drop edges (one each side when both are drawn, stacked otherwise).
  // Text sits beside the dimension line, or under its lower end (below: true) where the space beside
  // it is concrete.
  const vdim = (t, z0, z1, out, text, below = false) => {
    const x = X(t);
    const sign = Math.sign(out) || 1;
    const label = below
      ? `<text class="dimtext" x="${n(x + out)}" y="${n(Z(z0) + 16)}" text-anchor="${sign > 0 ? 'start' : 'end'}">${esc(text)}</text>`
      : `<text class="dimtext" x="${n(x + out + 5 * sign)}" y="${n((Z(z0) + Z(z1)) / 2 + 4)}" text-anchor="${sign > 0 ? 'start' : 'end'}">${esc(text)}</text>`;
    return dimensionTo([x, Z(z0)], [x, Z(z1)], [x + out, Z(z0)], [x + out, Z(z1)], '') + label;
  };
  if (!head || dropEnd < right) parts.push(vdim(right, 0, h, 18, `h = ${h}`));
  else if (dropEndL < -left) parts.push(vdim(left, 0, h, -18, `h = ${h}`));
  else parts.push(vdim(right, -hH, h, 18, `h_tot = ${h + hH}`));
  if (head) {
    // Total drop thickness at one visible drop edge (the slab end carries h).
    const sides = [[dropEnd, dropEnd < right, 1], [-dropEndL, dropEndL < -left, -1]].filter(([, visible]) => visible);
    if (sides.length) parts.push(vdim(sides[0][0], -hH, h, 16 * sides[0][2], `h_tot = ${h + hH}`, true));
  }

  // Key dimensions as text (no dimension lines): layer offsets, control sections, depths.
  const values = [];
  if (layers.length) {
    values.push(layers[0].zone === 'slab' ? `a1 = ${layers[0].pathOffset.toFixed(0)} from the drop` : `a1 = ${layers[0].offset.toFixed(0)}`);
    const radial = [...new Set(layers.slice(1).filter((layer, i) => layer.zone === layers[i].zone).map(layer => (layer.offset - layers[layers.indexOf(layer) - 1].offset).toFixed(0)))];
    if (radial.length) values.push(`s_r = ${radial.join(' / ')}`);
  }
  for (const item of rows) if (item[0] === 'r') values.push(item[2].includes('=') ? item[2] : `${item[2]} = ${item[1].toFixed(0)}`);
  values.push(`h = ${h}`);
  if (head) values.push(`h_tot = ${h + hH}`);
  if (section) values.push(`d = (d_x + d_y)/2 = ${((section.dx + section.dy) / 2).toFixed(0)}`);
  if (head?.kind === 'large' && head.inner) values.push(`d_H = d + (h_tot − h) = ${head.dH.toFixed(0)}`);
  // Callouts (45° leaders, QLEADER style) for the links and the drop only; flexural bars are in the
  // legend. A callout flips when its text would leave the drawing. Values wrap to the drawing width (about 6.3 px per character at 11 px).
  const valueLines = [];
  for (const value of values) {
    const lastLine = valueLines.at(-1);
    if (lastLine && (lastLine + ' · ' + value).length * 6.3 < width - 28) valueLines[valueLines.length - 1] = lastLine + ' · ' + value;
    else valueLines.push(value);
  }
  // Callouts go on the side with more slab (cs = ±1 along the local axis).
  const cs = toEdge(1) >= toEdge(-1) ? 1 : -1;
  const XC = t => X(cs * t);
  const far = cs > 0 ? right : -left;
  const dropEndC = cs > 0 ? dropEnd : dropEndL;
  const place = (x, y, dy, landing, lines, color) => {
    const run = Math.max(14, Math.abs(landing - y));
    const textWidth = Math.max(...lines.map(line => line.length)) * 6.2 + 10;
    let dx = cs;
    if (dx > 0 && x + run + textWidth > width - 4) dx = -1;
    else if (dx < 0 && x - run - textWidth < 4) dx = 1;
    return callout(x, y, dx, dy, run, lines, color);
  };
  const firstLink = layers.length ? cs * linkAt(layers[0], cs) : face;
  if (layers.length && firstLink <= far) {
    const ids = layers.length > 1 ? `${layers[0].id ?? 'L1'}–${layers.at(-1).id ?? 'L' + layers.length}` : layers[0].id ?? 'L1';
    const phis = [...new Set(layers.map(layer => layer.diameter))].map(phi => 'Ø' + phi).join('/');
    parts.push(place(XC(firstLink) + 2 * cs, Z(legTop) + 2, -1, Z(h) - 66, [`SHEAR LINKS ${ids}, ${phis}`, `${layers[0].shape === 'double' ? 'TWO-LEG' : 'SINGLE-LEG'}, SEE SCHEDULE`], COLORS.link));
  }
  // Drop panel callout from its soffit, on the side opposite the link callout when the drop shows
  // there. Flexural bars carry no callouts: the legend identifies them.
  const dropEndOpp = cs > 0 ? dropEndL : dropEnd;
  if (head && Math.max(dropEndC, dropEndOpp) > face + 1) {
    const size = input.head.shape === 'circular' ? 'Ø' + input.head.diameter : input.head.lx + ' × ' + input.head.ly;
    const lines = [`DROP PANEL ${size}, h_tot = ${h + hH}`];
    const run = Math.max(14, Z(zBot) + 22 - Z(-hH));
    const textWidth = lines[0].length * 6.2 + 10;
    const opposite = dropEndOpp > face + 1;
    const x0 = opposite ? XC(-(face + 0.45 * (dropEndOpp - face))) : XC(face + 0.35 * (dropEndC - face));
    const fits = dx => (dx > 0 ? x0 + run + textWidth < width - 4 : x0 - run - textWidth > 4);
    const dx = fits(-cs) ? -cs : cs;
    parts.push(callout(x0, Z(-hH), dx, 1, run, lines, COLORS.drop));
  }
  // Symbol legend: links, flexural bars along and across the section.
  const entries = [
    [`<line x1="0" y1="-6" x2="0" y2="6" stroke="${COLORS.link}" stroke-width="2"/>`, 'Shear link'],
    [`<line x1="-8" y1="0" x2="8" y2="0" stroke="${bar}" stroke-width="${barWidth}"/>`, section ? `Top bars (d_x ${section.dx.toFixed(0)}, d_y ${section.dy.toFixed(0)})` : 'Top bars'],
    [`<path d="M-8 -4H0V4H8" fill="none" stroke="${bar}" stroke-width="${barWidth}"/>`, head ? 'Bottom and drop bars, cranked at the drop edge (schematic)' : 'Bottom bars (schematic)'],
    [`<circle cx="0" cy="0" r="1.8" fill="${bar}"/>`, 'Bar across the section'],
  ];
  let lx = 22;
  let legendY = drawHeight + 16;
  const symbols = entries.map(([symbol, text]) => {
    const w = 34 + text.length * 6.2;
    if (lx > 22 && lx + w > width - 8) { lx = 22; legendY += 16; } // wrap to a second row
    const g = `<g transform="translate(${n(lx)} ${n(legendY - 4)})">${symbol}</g><text class="small" x="${n(lx + 14)}" y="${n(legendY)}">${esc(text)}</text>`;
    lx += w;
    return g;
  }).join('');
  const y0 = legendY + 18;
  parts.push(`<line x1="0" y1="${n(drawHeight)}" x2="${width}" y2="${n(drawHeight)}" stroke="${COLORS.rule}"/>` + symbols
    + valueLines.map((line, i) => `<text class="small" x="14" y="${n(y0 + 15 * i)}">${esc(line)}</text>`).join('')
    + `<text class="small" x="14" y="${n(y0 + 15 * valueLines.length)}">Section ${name} (local ${axis}) · legs at their offsets · hook anchorage requires detailing confirmation (§8.5).</text>`
    + `<text class="small" x="14" y="${n(y0 + 15 + 15 * valueLines.length)}">Distances in mm from the column face.</text>`);
  return svgDocument(width, height, `Punching shear section ${name}`, parts.join(''));
}
