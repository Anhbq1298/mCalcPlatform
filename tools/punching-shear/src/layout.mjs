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

export function newLayer(index, previous = {}) {
  return { offset: previous.offset ?? 100, diameter: previous.diameter ?? 10, shape: previous.shape ?? 'single', links: previous.links ?? 16, start: 0, omitted: [] };
}

// Centre positions (arc length) of the links of one layer.
export function linkCentres(geometry, links, start = 0) {
  const { intervals, u, total } = geometry;
  if (!intervals.length || links < 1) return [];
  if (intervals.length === 1 && intervals[0].closed) return Array.from({ length: links }, (_, i) => start + (i * u) / links);
  const shares = intervals.map(item => (links * (item.s1 - item.s0)) / total);
  const counts = shares.map(Math.floor);
  let rest = links - counts.reduce((a, b) => a + b, 0);
  const order = shares.map((share, i) => [share - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; counts[i] += 1; rest -= 1; }
  return intervals.flatMap((item, i) => Array.from({ length: counts[i] }, (_, k) => item.s0 + ((k + 0.5) * (item.s1 - item.s0)) / counts[i]));
}

export function buildLinks(model, layers, origin) {
  const { column, legGap = 100 } = model;
  return layers.flatMap((layer, layerIndex) => {
    const layerId = 'L' + (layerIndex + 1);
    const geometry = model.intervalsAt(layer.offset);
    const omitted = new Set(layer.omitted || []);
    return linkCentres(geometry, layer.links, layer.start || 0).map((centre, index) => ({ centre, index }))
      .filter(({ index }) => !omitted.has(index))
      .map(({ centre, index }) => {
        const at = pointAt(column, layer.offset, centre);
        const legPositions = layer.shape === 'double' ? [centre - legGap / 2, centre + legGap / 2] : [centre];
        const legs = legPositions.map((s, legIndex) => {
          const point = toGlobal(column, pointAt(column, layer.offset, s));
          const reason = exclusion(model, point);
          const u = geometry.u;
          return { id: `${layerId}-${index + 1}-${legIndex + 1}`, s: ((s % u) + u) % u, x: point.x, y: point.y, effective: !reason, reason };
        });
        return {
          id: `${layerId}-${index + 1}`, layerId, layerIndex, index, shape: layer.shape, diameter: layer.diameter,
          position: toGlobal(column, at), orientation: Math.atan2(at.ty, at.tx) * 180 / Math.PI + (column.rotation || 0),
          legs, material: 'fyk', origin, anchorage: model.anchorageState ?? 'Requires detailing confirmation',
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

export function layerSummary(model, layers, links) {
  return layers.map((layer, layerIndex) => {
    const own = links.filter(link => link.layerIndex === layerIndex);
    const geometry = model.intervalsAt(layer.offset);
    const legs = own.flatMap(link => link.legs);
    const effectiveLegs = legs.filter(leg => leg.effective).length;
    return {
      id: 'L' + (layerIndex + 1), offset: layer.offset, diameter: layer.diameter, shape: layer.shape,
      physicalLinks: own.length, legs: legs.length, effectiveLegs, u: geometry.total, uFull: geometry.u,
      asw: effectiveLegs * barArea(layer.diameter), aswTotal: legs.length * barArea(layer.diameter),
      tangential: tangentialGaps(own, geometry),
      ineffective: legs.filter(leg => !leg.effective).map(leg => ({ id: leg.id, reason: leg.reason })),
    };
  });
}

const floorTo = (value, step) => Math.floor(value / step + 1e-9) * step;

// Automatic layout (§6.4.5 and §9.4.3, recommended values): the smallest link count per layer that
// gives the required A_sw, the tangential spacing limit and the Eq. 9.11 leg area.
export function autoLayout({ model, d, asw, aOut, fck, fyk, diameter, shape, limits }) {
  if (!(asw > 0)) return { layers: [], reason: 'No punching reinforcement required.' };
  const first = Math.max(Math.ceil((limits.firstLayerMin * d) / 5) * 5, floorTo(0.4 * d, 5));
  const sr = floorTo(limits.radialSpacing * d, 5);
  if (!(sr > 0) || first > limits.firstLayerMax * d) return { layers: [], reason: 'Effective depth is too small for a valid first-layer position and radial spacing.' };
  const required = Math.max(aOut - limits.outerK * d, first);
  const count = Math.max(2, Math.ceil((required - first) / sr - 1e-9) + 1);
  const legArea = barArea(diameter);
  const perLink = LINK_SHAPES[shape].legs;
  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const offset = first + i * sr;
    const geometry = model.intervalsAt(offset);
    if (!geometry.total) return { layers: [], reason: `Layer L${i + 1} has no effective length inside the slab.` };
    const stLimit = (offset <= 2 * d ? limits.tangentialInside : limits.tangentialOutside) * d;
    const minLinks = Math.max(1, Math.ceil(Math.max(asw / legArea, geometry.total / stLimit, 4) / perLink - 1e-9));
    let found = null;
    for (let links = minLinks; links <= minLinks + 3000 && !found; links += 1) {
      if (perLink === 2 && model.legGap >= geometry.total / links) break; // legs of adjacent links would overlap
      const layer = { offset, diameter, shape, links, start: 0, omitted: [] };
      const summary = layerSummary(model, [layer], buildLinks(model, [layer], 'auto'))[0];
      const minLeg = (0.08 * Math.sqrt(fck) / fyk) * (sr * summary.tangential.max) / 1.5;
      if (summary.tangential.max <= stLimit + 1e-9 && summary.asw >= asw - 1e-9 && legArea >= minLeg - 1e-9) found = layer;
    }
    if (!found) return { layers: [], reason: `No valid link count for layer L${i + 1} with Ø${diameter} ${LINK_SHAPES[shape].label.toLowerCase()}s; the two-leg link width must be smaller than the link spacing; reduce it or use single-leg links.` };
    layers.push(found);
  }
  return { layers, first, sr };
}
