// Small SVG helpers shared by the plan and section drawings (string output, no DOM).

export const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const n = value => Number(value).toFixed(1);

export const COLORS = {
  ink: '#1f2a30', muted: '#56636a', rule: '#c3cbc8', steel: '#2b3a8c', concrete: '#d9dfdc',
  slab: '#f3f5f4', u1: '#1d6fb8', uout: '#b4541a', fail: '#a12420', governing: '#d99a0f', opening: '#a12420',
};

// Linear map from model mm (y up) to SVG px (y down) with equal scales.
export function viewport(bounds, width, height, pad = 34) {
  const sx = (width - 2 * pad) / (bounds.xMax - bounds.xMin);
  const sy = (height - 2 * pad) / (bounds.yMax - bounds.yMin);
  const scale = Math.min(sx, sy);
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  return {
    scale,
    x: x => width / 2 + (x - cx) * scale,
    y: y => height / 2 - (y - cy) * scale,
  };
}

export function polyline(points, view, attrs, closed = false) {
  const d = points.map((p, i) => (i ? 'L' : 'M') + n(view.x(p.x)) + ' ' + n(view.y(p.y))).join('') + (closed ? 'Z' : '');
  return `<path d="${d}" ${attrs}/>`;
}

// Dimension line between two SVG points, offset perpendicular by `offset` px, with extension lines.
export function dimension(x1, y1, x2, y2, text, offset = 0, cls = 'dim') {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * offset;
  const ny = ((x2 - x1) / len) * offset;
  const a = [x1 + nx, y1 + ny];
  const b = [x2 + nx, y2 + ny];
  const tx = (x2 - x1) / len * 4;
  const ty = (y2 - y1) / len * 4;
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  return `<g class="${cls}">`
    + (offset ? `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(a[0])}" y2="${n(a[1])}"/><line x1="${n(x2)}" y1="${n(y2)}" x2="${n(b[0])}" y2="${n(b[1])}"/>` : '')
    + `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}"/>`
    + `<line x1="${n(a[0] - ty)}" y1="${n(a[1] + tx)}" x2="${n(a[0] + ty)}" y2="${n(a[1] - tx)}"/>`
    + `<line x1="${n(b[0] - ty)}" y1="${n(b[1] + tx)}" x2="${n(b[0] + ty)}" y2="${n(b[1] - tx)}"/>`
    + `<text x="${n(mx)}" y="${n(my - 3)}" text-anchor="middle" transform="rotate(${n(upright)} ${n(mx)} ${n(my)})">${esc(text)}</text></g>`;
}

export const STYLE = `<style>
  text{font:11px Roboto,system-ui,sans-serif;fill:${COLORS.ink}}
  .dim line{stroke:${COLORS.muted};stroke-width:.8}
  .dim text{font-size:10.5px;fill:${COLORS.muted}}
  .label{font-size:10.5px}
  .small{font-size:9.5px;fill:${COLORS.muted}}
  .dim,text{pointer-events:none}
  .link{cursor:pointer}
  .link:hover circle{stroke:${COLORS.governing};stroke-width:2}
</style>`;

export function svgDocument(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><title>${esc(title)}</title>${STYLE}<rect width="${width}" height="${height}" fill="white"/>${body}</svg>`;
}
