// Individual punching links arranged in perimeter layers. Each layer follows the path at its offset
// from the loaded area (same shape as the control perimeters). Links are distributed uniformly by
// arc length from a start position; individual links may be omitted in check-provided mode.
// A leg is effective when it lies inside the slab and outside every opening.
import { perimeterAtOffset, pointAt, pointInOpening, pointInSlab, toGlobal } from './geometry.mjs';
import { barArea } from './resistance.mjs';

export const LINK_SHAPES = {
  single: { label: 'Single-leg link', legs: 1 },
  double: { label: 'Two-leg link (tangential)', legs: 2 },
};

export function newLayer(index, previous = {}) {
  return { offset: previous.offset ?? 100, diameter: previous.diameter ?? 10, shape: previous.shape ?? 'single', links: previous.links ?? 16, start: 0, omitted: [] };
}

function legPositions(layer, u, legGap) {
  const positions = [];
  const step = u / layer.links;
  const omitted = new Set(layer.omitted || []);
  for (let i = 0; i < layer.links; i += 1) {
    if (omitted.has(i)) continue;
    const centre = (layer.start || 0) + i * step;
    const legs = layer.shape === 'double' ? [centre - legGap / 2, centre + legGap / 2] : [centre];
    positions.push({ index: i, centre, legs });
  }
  return positions;
}

// Physical link objects for every layer.
export function buildLinks(model, layers, origin) {
  const { column, slab, openings = [], legGap = 100 } = model;
  return layers.flatMap((layer, layerIndex) => {
    const layerId = 'L' + (layerIndex + 1);
    const u = perimeterAtOffset(column, layer.offset);
    return legPositions(layer, u, legGap).map(({ index, centre, legs }) => {
      const at = pointAt(column, layer.offset, centre);
      const position = toGlobal(column, at);
      const orientation = Math.atan2(at.ty, at.tx) * 180 / Math.PI + (column.rotation || 0);
      const legObjects = legs.map((s, legIndex) => {
        const point = toGlobal(column, pointAt(column, layer.offset, s));
        const outside = !pointInSlab(slab, point);
        const inOpening = openings.some(opening => pointInOpening(opening, point));
        const reason = outside ? 'Outside slab' : inOpening ? 'Inside opening' : null;
        return { id: `${layerId}-${index + 1}-${legIndex + 1}`, s: ((s % u) + u) % u, x: point.x, y: point.y, effective: !reason, reason };
      });
      return {
        id: `${layerId}-${index + 1}`, layerId, layerIndex, index, shape: layer.shape, diameter: layer.diameter,
        position, orientation, legs: legObjects, material: 'fyk', origin,
        anchorage: 'Requires detailing confirmation',
      };
    });
  });
}

// Gaps between consecutive effective legs along the layer path (arc length), including the wrap.
export function tangentialGaps(links, u) {
  const legs = links.flatMap(link => link.legs.filter(leg => leg.effective).map(leg => ({ ...leg, linkId: link.id })))
    .sort((a, b) => a.s - b.s);
  if (legs.length === 0) return { max: u, gaps: [{ from: null, to: null, length: u, s0: 0, s1: u }] };
  if (legs.length === 1) return { max: u, gaps: [{ from: legs[0].id, to: legs[0].id, length: u, s0: legs[0].s, s1: legs[0].s + u }] };
  const gaps = legs.map((leg, i) => {
    const next = legs[(i + 1) % legs.length];
    const length = i === legs.length - 1 ? next.s + u - leg.s : next.s - leg.s;
    return { from: leg.id, to: next.id, length, s0: leg.s, s1: leg.s + length };
  });
  return { max: Math.max(...gaps.map(gap => gap.length)), gaps };
}

export function layerSummary(model, layers, links) {
  return layers.map((layer, layerIndex) => {
    const own = links.filter(link => link.layerIndex === layerIndex);
    const u = perimeterAtOffset(model.column, layer.offset);
    const legs = own.flatMap(link => link.legs);
    const effectiveLegs = legs.filter(leg => leg.effective).length;
    return {
      id: 'L' + (layerIndex + 1), offset: layer.offset, diameter: layer.diameter, shape: layer.shape,
      physicalLinks: own.length, legs: legs.length, effectiveLegs, u,
      asw: effectiveLegs * barArea(layer.diameter), aswTotal: legs.length * barArea(layer.diameter),
      tangential: tangentialGaps(own, u),
      ineffective: legs.filter(leg => !leg.effective).map(leg => ({ id: leg.id, reason: leg.reason })),
    };
  });
}

const floorTo = (value, step) => Math.floor(value / step + 1e-9) * step;

// Automatic layout (§6.4.5 and §9.4.3, recommended values). Returns layers or a reason.
export function autoLayout({ column, d, asw, aOut, fck, fyk, diameter, shape, legGap, limits }) {
  if (!(asw > 0)) return { layers: [], reason: 'No punching reinforcement required.' };
  const first = Math.max(Math.ceil(limits.firstLayerMin * d / 5) * 5, Math.min(floorTo(0.4 * d, 5), floorTo(limits.firstLayerMax * d, 5)));
  const sr = floorTo(limits.radialSpacing * d, 5);
  if (!(sr > 0) || first > limits.firstLayerMax * d) return { layers: [], reason: 'Effective depth is too small for a valid first-layer position and radial spacing.' };
  const required = Math.max(aOut - limits.outerK * d, first);
  const count = Math.max(2, Math.ceil((required - first) / sr - 1e-9) + 1);
  const legArea = barArea(diameter);
  const legsPerLink = LINK_SHAPES[shape].legs;
  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const offset = first + i * sr;
    const u = perimeterAtOffset(column, offset);
    const stLimit = (offset <= 2 * d ? limits.tangentialInside : limits.tangentialOutside) * d;
    const minLeg = st => (0.08 * Math.sqrt(fck) / fyk) * (sr * st) / 1.5;
    let legs = Math.max(Math.ceil(asw / legArea - 1e-9), Math.ceil(u / stLimit - 1e-9), 4);
    for (let guard = 0; guard < 2000; guard += 1) {
      const links = Math.ceil(legs / legsPerLink);
      const step = u / links;
      const maxGap = legsPerLink === 2 ? Math.max(legGap, step - legGap) : step;
      if (legsPerLink === 2 && legGap >= step) return { layers: [], reason: `Two-leg link width ${legGap} mm does not fit layer L${i + 1}; use single-leg links or a smaller width.` };
      if (maxGap <= stLimit + 1e-9 && legArea >= minLeg(maxGap) - 1e-9 && links * legsPerLink * legArea >= asw - 1e-9) {
        layers.push({ offset, diameter, shape, links, start: 0, omitted: [] });
        break;
      }
      legs += legsPerLink;
      if (guard === 1999) return { layers: [], reason: `No valid leg count for layer L${i + 1} with Ø${diameter}.` };
    }
  }
  return { layers, first, sr };
}
