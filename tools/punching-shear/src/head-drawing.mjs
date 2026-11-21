// Drop panel outline in plan (hidden line: the drop is below the slab soffit).
import { toGlobal } from './geometry.mjs';
import { COLORS, DASH, n, polyline } from './svg.mjs';

export function headOutline(input, view) {
  const { column, head } = input;
  const top = toGlobal(column, { x: head.shape === 'circular' ? 0 : -head.lx / 2, y: head.shape === 'circular' ? -head.diameter / 2 : -head.ly / 2 });
  const label = `<text class="small" x="${n(view.x(top.x) + 4)}" y="${n(view.y(top.y) + 13)}">DROP ${head.shape === 'circular' ? 'Ø' + head.diameter : head.lx + ' × ' + head.ly}, h_H ${head.depth} (below)</text>`;
  if (head.shape === 'circular') {
    const r = (head.diameter / 2) * view.scale;
    return label + `<circle cx="${n(view.x(column.x))}" cy="${n(view.y(column.y))}" r="${n(r)}" fill="none" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${DASH.hidden}"/>`;
  }
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: (sx * head.lx) / 2, y: (sy * head.ly) / 2 }));
  return label + polyline(corners, view, `fill="none" stroke="${COLORS.ink}" stroke-width=".9" stroke-dasharray="${DASH.hidden}"`, true);
}
