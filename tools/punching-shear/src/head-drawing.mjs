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
