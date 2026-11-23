// Drop panel outline in plan (hidden line: the drop is below the slab soffit).
import { toGlobal } from './geometry.mjs';
import { headExtents } from './head.mjs';
import { COLORS, DASH, callout, n, polyline } from './svg.mjs';

export function headOutline(input, view, run = 26) {
  const { column, head } = input;
  const ext = headExtents(input);
  // QLEADER callout from the drop outline (upper left, 45° leader outward past the perimeters).
  const r = head.diameter / 2;
  const at = head.shape === 'circular' ? { x: -r * Math.SQRT1_2, y: r * Math.SQRT1_2 } : { x: ext.xMin + 0.18 * (ext.xMax - ext.xMin), y: ext.yMax };
  const p = toGlobal(column, at);
  const size = head.shape === 'circular' ? 'Ø' + head.diameter : head.lx + ' × ' + head.ly;
  const label = callout(view.x(p.x), view.y(p.y), -1, -1, run, [`DROP PANEL ${size}`, `h_tot = ${head.thickness} (HIDDEN)`], COLORS.drop);
  if (head.shape === 'circular') {
    const r = (head.diameter / 2) * view.scale;
    return label + `<circle cx="${n(view.x(column.x))}" cy="${n(view.y(column.y))}" r="${n(r)}" fill="none" stroke="${COLORS.drop}" stroke-width="1.2" stroke-dasharray="${DASH.hidden}"/>`;
  }
  const e = headExtents(input); // clipped to the slab at edge and corner columns
  const corners = [[e.xMin, e.yMin], [e.xMax, e.yMin], [e.xMax, e.yMax], [e.xMin, e.yMax]].map(([x, y]) => toGlobal(column, { x, y }));
  return label + polyline(corners, view, `fill="none" stroke="${COLORS.drop}" stroke-width="1.2" stroke-dasharray="${DASH.hidden}"`, true);
}

// Mixed head: the composite inner section's straight parts at 2d_H from the faces with l_H ≥ 2h_H (d_H);
// the rest of that section is the slab section u1,ext, drawn with the slab checks.
export function compositeLines(head, column, view, color, width) {
  const r = 2 * head.dH;
  const a = column.cx / 2;
  const b = column.cy / 2;
  const seg = { xMax: [[a + r, -b], [a + r, b]], xMin: [[-a - r, -b], [-a - r, b]], yMax: [[-a, b + r], [a, b + r]], yMin: [[-a, -b - r], [a, -b - r]] };
  const out = head.composite.long.map(side => {
    const [p, q] = seg[side].map(([x, y]) => toGlobal(column, { x, y }));
    return `<line x1="${n(view.x(p.x))}" y1="${n(view.y(p.y))}" x2="${n(view.x(q.x))}" y2="${n(view.y(q.y))}" stroke="${color}" stroke-width="${width}"/>`;
  });
  // Corner arcs at 2d_H where the head reaches 2h_H along the normal.
  // φ is measured from the x-face normal towards the y face (composite.mjs CORNERS order).
  const corner = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const arc of head.composite.arcs ?? []) {
    const [sx, sy] = corner[arc.corner];
    const pts = Array.from({ length: 13 }, (_, j) => arc.from + ((arc.to - arc.from) * j) / 12)
      .map(t => toGlobal(column, { x: sx * (a + r * Math.cos(t)), y: sy * (b + r * Math.sin(t)) }))
      .map(p => `${n(view.x(p.x))},${n(view.y(p.y))}`).join(' ');
    out.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${width}"/>`);
  }
  const first = head.composite.long[0];
  const [x, y] = first ? seg[first][1] : [a + r, 0];
  const q = toGlobal(column, { x, y });
  out.push(callout(view.x(q.x), view.y(q.y), 1, -1, 30, ['u1,int composite']));
  return out.join('');
}
