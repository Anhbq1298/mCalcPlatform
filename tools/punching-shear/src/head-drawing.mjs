// Drop panel outline in plan (hidden line: the drop is below the slab soffit).
import { toGlobal } from './geometry.mjs';
import { headExtents } from './head.mjs';
import { COLORS, DASH, n, polyline } from './svg.mjs';

export function headOutline(input, view) {
  const { column, head } = input;
  const ext = headExtents(input);
  const top = toGlobal(column, { x: head.shape === 'circular' ? 0 : ext.xMin, y: head.shape === 'circular' ? head.diameter / 2 : ext.yMax });
  const label = `<text class="small" fill="${COLORS.drop}" style="fill:${COLORS.drop}" x="${n(view.x(top.x) + 4)}" y="${n(view.y(top.y) + 14)}">DROP ${head.shape === 'circular' ? 'Ø' + head.diameter : head.lx + ' × ' + head.ly}, h_H ${head.depth} (below)</text>`;
  if (head.shape === 'circular') {
    const r = (head.diameter / 2) * view.scale;
    return label + `<circle cx="${n(view.x(column.x))}" cy="${n(view.y(column.y))}" r="${n(r)}" fill="none" stroke="${COLORS.drop}" stroke-width="1.2" stroke-dasharray="${DASH.hidden}"/>`;
  }
  const e = headExtents(input); // clipped to the slab at edge and corner columns
  const corners = [[e.xMin, e.yMin], [e.xMax, e.yMin], [e.xMax, e.yMax], [e.xMin, e.yMax]].map(([x, y]) => toGlobal(column, { x, y }));
  return label + polyline(corners, view, `fill="none" stroke="${COLORS.drop}" stroke-width="1.2" stroke-dasharray="${DASH.hidden}"`, true);
}
