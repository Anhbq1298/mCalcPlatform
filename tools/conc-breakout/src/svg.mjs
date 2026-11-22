// SVG string helpers for the plan and section drawings (no DOM). Model units are mm; the view maps
// model (u, v) to screen with v up. Colours follow the drawing convention in the help page.
export const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const n = value => Number(value).toFixed(1);
export const CAD_FONT = "'ISOCPEUR','isocpeur','osifont','Roboto Mono',ui-monospace,monospace";

export const COLORS = {
  concrete: '#e3e5e7', concreteEdge: '#9aa0a6', steel: '#5b6b7d', steelFill: '#c4ccd6', rebar: '#e07b00',
  tension: '#c62828', compression: '#1f5fbf', shear: '#7b1fa2', failure: '#c62828', ink: '#333a40', muted: '#6b7076',
};

export function view(bounds, width, height, pad = 46) {
  const scale = Math.min((width - 2 * pad) / (bounds.u1 - bounds.u0), (height - 2 * pad) / (bounds.v1 - bounds.v0));
  const ox = (width - scale * (bounds.u1 - bounds.u0)) / 2 - scale * bounds.u0;
  const oy = (height + scale * (bounds.v1 - bounds.v0)) / 2 + scale * bounds.v0;
  return { scale, x: u => ox + u * scale, y: v => oy - v * scale, width, height };
}

export const frame = (v, body, label, height = v.height) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v.width} ${height}" role="img" aria-label="${esc(label)}" font-family="${CAD_FONT}" font-size="11">`
  + `<rect width="${v.width}" height="${height}" fill="#ffffff"/>${body}</svg>`;

export const rect = (v, u0, v0, u1, v1, style) => `<rect x="${n(v.x(Math.min(u0, u1)))}" y="${n(v.y(Math.max(v0, v1)))}" width="${n(Math.abs(u1 - u0) * v.scale)}" height="${n(Math.abs(v1 - v0) * v.scale)}" ${style}/>`;
export const line = (v, u0, v0, u1, v1, style) => `<line x1="${n(v.x(u0))}" y1="${n(v.y(v0))}" x2="${n(v.x(u1))}" y2="${n(v.y(v1))}" ${style}/>`;
export const circle = (v, u, w, r, style) => `<circle cx="${n(v.x(u))}" cy="${n(v.y(w))}" r="${n(Math.max(r * v.scale, 1.5))}" ${style}/>`;
export const label = (x, y, text, { anchor = 'middle', color = COLORS.ink, size = 11, weight = 400 } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(text)}</text>`;
export const polyline = (v, points, style) => `<polyline points="${points.map(([u, w]) => n(v.x(u)) + ',' + n(v.y(w))).join(' ')}" fill="none" ${style}/>`;

// Force arrow in screen space ending at (x, y), arriving from direction (dx, dy) with length len.
export function arrow(x, y, dx, dy, len, color, text, textSide = 1, anchor = null) {
  const sx = x - dx * len;
  const sy = y - dy * len;
  const ux = -dy;
  const uy = dx;
  const head = `M${n(x)} ${n(y)}L${n(x - dx * 9 + ux * 3.5)} ${n(y - dy * 9 + uy * 3.5)}L${n(x - dx * 9 - ux * 3.5)} ${n(y - dy * 9 - uy * 3.5)}Z`;
  const tx = sx + ux * 10 * textSide;
  const ty = sy + uy * 10 * textSide + 4;
  return `<g><line x1="${n(sx)}" y1="${n(sy)}" x2="${n(x - dx * 8)}" y2="${n(y - dy * 8)}" stroke="${color}" stroke-width="1.8"/><path d="${head}" fill="${color}"/>`
    + (text ? label(tx, ty, text, { anchor: anchor ?? (textSide * ux >= 0 ? 'start' : 'end'), color, weight: 600 }) : '') + '</g>';
}

// Aligned dimension between two model points, offset by `off` px (screen) perpendicular.
export function dim(v, u0, w0, u1, w1, off, text) {
  const x0 = v.x(u0);
  const y0 = v.y(w0);
  const x1 = v.x(u1);
  const y1 = v.y(w1);
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const px = -(y1 - y0) / len * off;
  const py = (x1 - x0) / len * off;
  const style = `stroke="${COLORS.ink}" stroke-width=".7"`;
  const tick = (x, y) => `<line x1="${n(x - 3)}" y1="${n(y + 3)}" x2="${n(x + 3)}" y2="${n(y - 3)}" ${style}/>`;
  const mx = (x0 + x1) / 2 + px;
  const my = (y0 + y1) / 2 + py;
  const vertical = Math.abs(x1 - x0) < Math.abs(y1 - y0);
  return `<g><line x1="${n(x0)}" y1="${n(y0)}" x2="${n(x0 + px * 1.15)}" y2="${n(y0 + py * 1.15)}" ${style}/><line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x1 + px * 1.15)}" y2="${n(y1 + py * 1.15)}" ${style}/>`
    + `<line x1="${n(x0 + px)}" y1="${n(y0 + py)}" x2="${n(x1 + px)}" y2="${n(y1 + py)}" ${style}/>${tick(x0 + px, y0 + py)}${tick(x1 + px, y1 + py)}`
    + (vertical ? `<text x="${n(mx - 4)}" y="${n(my)}" transform="rotate(-90 ${n(mx - 4)} ${n(my)})" text-anchor="middle" fill="${COLORS.ink}">${esc(text)}</text>`
      : `<text x="${n(mx)}" y="${n(my - 4)}" text-anchor="middle" fill="${COLORS.ink}">${esc(text)}</text>`) + '</g>';
}
