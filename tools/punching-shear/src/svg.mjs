// Small SVG helpers shared by the plan and section drawings (string output, no DOM).

export const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const n = value => Number(value).toFixed(1);

// Monochrome CAD palette: elements are told apart by line type and weight. Red is kept only for
// failed items (ineffective legs, failing gaps) so that a failure is never hidden.
import { svgSubscripts } from './subscript.mjs';

export const COLORS = {
  ink: '#141414', muted: '#6b7076', rule: '#c9ced3', steel: '#141414', concrete: '#ffffff',
  slab: '#ffffff', edge: '#b9bec4', u1: '#141414', uout: '#141414', fail: '#b3261e', governing: '#8a8f94', opening: '#141414',
  gridMinor: '#f0f2f4', gridMajor: '#dde1e5',
  link: '#d32f2f', bar: '#7a8088',
};

// QLEADER-style callout: arrowhead at the feature, 45° leg of `run` px, horizontal landing, text on
// the landing. dx, dy = ±1 give the direction of the 45° leg (screen axes).
export function callout(x, y, dx, dy, run, lines, color = COLORS.ink) {
  const ex = x + dx * run;
  const ey = y + dy * run;
  const width = Math.max(...lines.map(line => line.length)) * 6.2 + 6;
  const lx = ex + dx * width;
  const ux = -dx / Math.SQRT2;
  const uy = -dy / Math.SQRT2;
  const head = `<path d="M${n(x)} ${n(y)}L${n(x - ux * 7 - uy * 2.5)} ${n(y - uy * 7 + ux * 2.5)}L${n(x - ux * 7 + uy * 2.5)} ${n(y - uy * 7 - ux * 2.5)}Z" fill="${color}"/>`;
  const anchor = dx > 0 ? 'start' : 'end';
  const tx = ex + dx * 3;
  const text = lines.map((line, i) => `<text class="small" x="${n(tx)}" y="${n(ey - 4 - (lines.length - 1 - i) * 11)}" text-anchor="${anchor}" fill="${COLORS.ink}">${esc(line)}</text>`).join('');
  return `<g class="callout">${head}<path d="M${n(x)} ${n(y)}L${n(ex)} ${n(ey)}L${n(lx)} ${n(ey)}" fill="none" stroke="${COLORS.ink}" stroke-width=".7"/>${text}</g>`;
}
// Technical lettering: ISOCPEUR when installed (AutoCAD), else the bundled ISO 3098 font osifont.
export const CAD_FONT = "'ISOCPEUR','isocpeur','osifont','Roboto Mono',ui-monospace,monospace";
export const DASH = { hidden: '6 4', u1: '14 5', uout: '16 4 3 4 3 4', ext: '22 4 3 4', centre: '18 4 3 4', layer: '2 3' };

// Model-space grid: minor every 100 mm, major every 500 mm, clipped to the drawing area.
export function grid(view, bounds, top, bottom, width) {
  const out = [];
  for (const [step, color] of [[100, COLORS.gridMinor], [500, COLORS.gridMajor]]) {
    if (step * view.scale < 4) continue;
    for (let x = Math.ceil(bounds.xMin / step) * step; x <= bounds.xMax; x += step) {
      const px = view.x(x);
      if (px >= 0 && px <= width) out.push(`<line x1="${n(px)}" y1="${n(top)}" x2="${n(px)}" y2="${n(bottom)}" stroke="${color}" stroke-width=".6"/>`);
    }
    for (let y = Math.ceil(bounds.yMin / step) * step; y <= bounds.yMax; y += step) {
      const py = view.y(y);
      if (py >= top && py <= bottom) out.push(`<line x1="0" y1="${n(py)}" x2="${width}" y2="${n(py)}" stroke="${color}" stroke-width=".6"/>`);
    }
  }
  return out.join('');
}

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
  const sx = Math.sign(offset) || 1;
  const ux = (nx / (Math.abs(offset) || 1)) * sx;
  const uy = (ny / (Math.abs(offset) || 1)) * sx;
  const ext = (px, py, qx, qy) => `<line x1="${n(px + ux * 2)}" y1="${n(py + uy * 2)}" x2="${n(qx + ux * 3)}" y2="${n(qy + uy * 3)}"/>`;
  return `<g class="${cls}">`
    + (offset ? ext(x1, y1, a[0], a[1]) + ext(x2, y2, b[0], b[1]) : '')
    + `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}"/>`
    + `<line class="tick" x1="${n(a[0] - tx - ty)}" y1="${n(a[1] - ty + tx)}" x2="${n(a[0] + tx + ty)}" y2="${n(a[1] + ty - tx)}"/>`
    + `<line class="tick" x1="${n(b[0] - tx - ty)}" y1="${n(b[1] - ty + tx)}" x2="${n(b[0] + tx + ty)}" y2="${n(b[1] + ty - tx)}"/>`
    + `<text x="${n(mx)}" y="${n(my - 3)}" text-anchor="middle" transform="rotate(${n(upright)} ${n(mx)} ${n(my)})">${esc(text)}</text></g>`;
}

// Dimension with explicit feature points p1, p2 and dimension-line points q1, q2 (extension lines
// run from each feature to the dimension line with a 2 px gap and 3 px overshoot).
export function dimensionTo(p1, p2, q1, q2, text) {
  const ext = (p, q) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 4) return '';
    const ux = (q[0] - p[0]) / len;
    const uy = (q[1] - p[1]) / len;
    return `<line x1="${n(p[0] + ux * 2)}" y1="${n(p[1] + uy * 2)}" x2="${n(q[0] + ux * 3)}" y2="${n(q[1] + uy * 3)}"/>`;
  };
  return dimension(q1[0], q1[1], q2[0], q2[1], text, 0).replace('<g class="dim">', '<g class="dim">' + ext(p1, q1) + ext(p2, q2));
}

export const STYLE = `<style>
  text{font:12px ${CAD_FONT};fill:${COLORS.ink}}
  .dim line{stroke:${COLORS.ink};stroke-width:.55}
  .dim line.tick{stroke-width:1.3}
  .dim text{font-size:12px;fill:${COLORS.ink}}
  .label{font-size:12px}
  .small{font-size:11px;fill:${COLORS.muted}}
  .dim,text{pointer-events:none}
  .link{cursor:pointer}
  .link:hover circle{stroke:${COLORS.governing};stroke-width:2}
</style>`;

export function svgDocument(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><title>${esc(title)}</title>${STYLE}<rect width="${width}" height="${height}" fill="white"/>${svgSubscripts(body)}</svg>`;
}
