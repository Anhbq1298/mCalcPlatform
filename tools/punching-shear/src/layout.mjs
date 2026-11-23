// Individual punching links arranged in perimeter layers. A layer follows the path at its offset
// from the loaded area. On a complete closed path, links are spaced uniformly from a start position;
// on clipped paths (slab edges, openings) links are shared between the effective intervals in
// proportion to their length and centred in equal sub-lengths. A leg is effective when it lies on
// the effective part of the path (inside the slab, outside openings and opening shadows).
import { pointAt, toGlobal } from './geometry.mjs';
import { exclusion } from './perimeters.mjs';
import { barArea } from './resistance.mjs';

export const LINK_SHAPES = {
  single: { label: 'Single-leg link', legs: 1 },
  double: { label: 'Two-leg link (tangential)', legs: 2 },
};

// Centre positions (arc length) of the links of one layer. With a tangential spacing st (link centre
// to centre), each effective interval gets ceil(length / st) links, so no gap exceeds st; otherwise
// `links` is shared between the intervals.
export function linkCentres(geometry, links, start = 0, st = 0) {
  const { intervals, u, total } = geometry;
  if (!intervals.length) return [];
  if (st > 0) {
    if (intervals.length === 1 && intervals[0].closed) {
      const n = Math.ceil(u / st - 1e-9);
      return Array.from({ length: n }, (_, i) => start + (i * u) / n);
    }
    return intervals.flatMap(item => {
      const n = Math.max(1, Math.ceil((item.s1 - item.s0) / st - 1e-9));
      return Array.from({ length: n }, (_, k) => item.s0 + ((k + 0.5) * (item.s1 - item.s0)) / n);
    });
  }
  if (links < 1) return [];
  if (intervals.length === 1 && intervals[0].closed) return Array.from({ length: links }, (_, i) => start + (i * u) / links);
  const shares = intervals.map(item => (links * (item.s1 - item.s0)) / total);
  const counts = shares.map(Math.floor);
  let rest = links - counts.reduce((a, b) => a + b, 0);
  const order = shares.map((share, i) => [share - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; counts[i] += 1; rest -= 1; }
  return intervals.flatMap((item, i) => Array.from({ length: counts[i] }, (_, k) => item.s0 + ((k + 0.5) * (item.s1 - item.s0)) / counts[i]));
}

export function buildLinks(model, layers, origin, base = 0) {
  const { column, legGap = 100 } = model;
  return layers.flatMap((layer, layerIndex) => {
    const layerId = layer.id ?? 'L' + (base + layerIndex + 1);
    const geometry = model.intervalsAt(layer.offset);
    const omitted = new Set(layer.omitted || []);
    // Arranged layers (radial, grid) carry their own points; perimeter layers are spaced along the path.
    const centres = layer.points ? layer.points.map(p => p.s) : linkCentres(geometry, layer.links, layer.start || 0, layer.st);
    return centres.map((centre, index) => ({ centre, index }))
      .filter(({ index }) => !omitted.has(index))
      .map(({ centre, index }) => {
        const own = layer.points?.[index];
        const onPath = pointAt(column, layer.offset, centre);
        // Off-path points (grid corners) keep their position; legs of two-leg links sit ± legGap/2 along the tangent.
        const at = own ? { ...onPath, x: own.x, y: own.y } : onPath;
        const legPositions = layer.shape === 'double' ? [centre - legGap / 2, centre + legGap / 2] : [centre];
        const legs = legPositions.map((s, legIndex) => {
          const shift = s - centre;
          const point = toGlobal(column, own ? { x: own.x + shift * onPath.tx, y: own.y + shift * onPath.ty } : pointAt(column, layer.offset, s));
          const reason = exclusion(model, point);
          const u = geometry.u;
          return { id: `${layerId}-${index + 1}-${legIndex + 1}`, s: ((s % u) + u) % u, x: point.x, y: point.y, effective: !reason, reason };
        });
        return {
          id: `${layerId}-${index + 1}`, layerId, layerIndex, index, shape: layer.shape, diameter: layer.diameter,
          position: toGlobal(column, at), orientation: Math.atan2(at.ty, at.tx) * 180 / Math.PI + (column.rotation || 0),
          legs, material: 'fyk', origin, anchorage: model.anchorageState ?? 'Pass',
        };
      });
  });
}

// Gaps along the effective intervals between consecutive effective legs, including the end gaps of
// open intervals (to a free edge or an opening shadow). A complete closed path wraps around.
export function tangentialGaps(links, geometry) {
  const { intervals, u } = geometry;
  const legs = links.flatMap(link => link.legs.filter(leg => leg.effective)).map(leg => leg.s).sort((a, b) => a - b);
  const gaps = [];
  for (const item of intervals) {
    if (item.closed) {
      if (legs.length < 2) gaps.push({ length: u, s0: legs[0] ?? 0, s1: (legs[0] ?? 0) + u });
      else legs.forEach((s, i) => {
        const next = i === legs.length - 1 ? legs[0] + u : legs[i + 1];
        gaps.push({ length: next - s, s0: s, s1: next });
      });
      continue;
    }
    const inside = legs.flatMap(s => [s, s + u]).filter(s => s >= item.s0 - 1e-6 && s <= item.s1 + 1e-6).sort((a, b) => a - b);
    const points = [item.s0, ...inside, item.s1];
    for (let i = 1; i < points.length; i += 1) gaps.push({ length: points[i] - points[i - 1], s0: points[i - 1], s1: points[i] });
  }
  if (!gaps.length) return { max: 0, gaps };
  return { max: Math.max(...gaps.map(gap => gap.length)), gaps };
}

export function layerSummary(model, layers, links, base = 0) {
  return layers.map((layer, layerIndex) => {
    const own = links.filter(link => link.layerIndex === layerIndex);
    const geometry = model.intervalsAt(layer.offset);
    const legs = own.flatMap(link => link.legs);
    const effectiveLegs = legs.filter(leg => leg.effective).length;
    return {
      id: layer.id ?? 'L' + (base + layerIndex + 1), offset: layer.offset, diameter: layer.diameter, shape: layer.shape,
      physicalLinks: own.length, legs: legs.length, effectiveLegs, u: geometry.total, uFull: geometry.u,
      asw: effectiveLegs * barArea(layer.diameter), aswTotal: legs.length * barArea(layer.diameter),
      tangential: tangentialGaps(own, geometry),
      ineffective: legs.filter(leg => !leg.effective).map(leg => ({ id: leg.id, reason: leg.reason })),
    };
  });
}
