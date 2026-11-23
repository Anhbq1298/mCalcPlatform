// Optional plan overlay: the perimeter of each link layer, a thin solid green line through its links in
// order round the column. A layer cut by a slab edge or an opening (a gap much wider than the others) is
// left open across the cut.
import { n } from './svg.mjs';

export const LAYER_LINE_COLOR = '#2e9e44';

export function layerLines(result, view) {
  const links = (result.layout?.links ?? []).filter(link => !link.edge);
  const centre = result.layout?.layers?.length ? { x: result.input.column.x ?? 0, y: result.input.column.y ?? 0 } : null;
  if (!centre) return '';
  const byLayer = new Map();
  for (const link of links) {
    if (!byLayer.has(link.layerId)) byLayer.set(link.layerId, []);
    byLayer.get(link.layerId).push(link.position);
  }
  let out = '';
  for (const points of byLayer.values()) {
    if (points.length < 2) continue;
    const ring = points.map(p => ({ ...p, t: Math.atan2(p.y - centre.y, p.x - centre.x) })).sort((p, q) => p.t - q.t);
    const gaps = ring.map((p, i) => Math.hypot(ring[(i + 1) % ring.length].x - p.x, ring[(i + 1) % ring.length].y - p.y));
    const sorted = [...gaps].sort((p, q) => p - q);
    const typical = sorted[Math.floor(sorted.length / 2)];
    const widest = gaps.indexOf(Math.max(...gaps));
    const open = gaps[widest] > 2.5 * typical + 1e-6;
    // Open: start after the widest gap (the cut); closed: back to the first link.
    const order = open ? [...ring.slice(widest + 1), ...ring.slice(0, widest + 1)] : [...ring, ring[0]];
    const pts = order.map(p => `${n(view.x(p.x))},${n(view.y(p.y))}`).join(' ');
    out += `<polyline class="layer-line" points="${pts}" fill="none" stroke="${LAYER_LINE_COLOR}" stroke-width=".5"/>`;
  }
  return out;
}
