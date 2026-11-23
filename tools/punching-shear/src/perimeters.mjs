// Effective parts of a check perimeter or link layer path at offset r from the loaded area:
// inside the slab, outside openings, and outside the ineffective sector of every opening within 6d
// (EN 1992-1-1 §6.4.2(3), Fig. 6.14). Lengths use the exact path parametrisation; interval ends are
// located by bisection to 1e-6 mm.
import { openingDistance, perimeterAtOffset, pointAt, pointInOpening, pointInSlab, toGlobal } from './geometry.mjs';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Ineffective sector of an opening seen from the centre of the loaded area. When the radial depth
// l1 exceeds the tangential width l2, l2 is replaced by √(l1·l2) (Fig. 6.14).
export function openingShadows(column, openings, d) {
  const cx = column.x || 0;
  const cy = column.y || 0;
  return openings.map((opening, index) => {
    const distance = openingDistance(column, opening);
    if (distance > 6 * d) return null;
    const radialX = Math.abs(opening.x - cx) >= Math.abs(opening.y - cy);
    const l1 = radialX ? opening.w : opening.h;
    const l2 = radialX ? opening.h : opening.w;
    const width = l1 > l2 ? Math.sqrt(l1 * l2) : l2;
    const w = radialX ? opening.w : width;
    const h = radialX ? width : opening.h;
    const mid = Math.atan2(opening.y - cy, opening.x - cx);
    let low = 0;
    let high = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const delta = wrap(Math.atan2(opening.y + (sy * h) / 2 - cy, opening.x + (sx * w) / 2 - cx) - mid);
      low = Math.min(low, delta);
      high = Math.max(high, delta);
    }
    return { index, distance, mid, low, high, l1, l2, replaced: l1 > l2, effectiveWidth: width };
  }).filter(Boolean);
}

export function inShadow(column, shadows, point) {
  const angle = Math.atan2(point.y - (column.y || 0), point.x - (column.x || 0));
  return shadows.some(shadow => {
    const delta = wrap(angle - shadow.mid);
    return delta >= shadow.low - 1e-12 && delta <= shadow.high + 1e-12;
  });
}

// Why a point on a path is ineffective, or null when it is effective.
export function exclusion(model, point) {
  if (!pointInSlab(model.slab, point)) return 'Outside slab';
  if ((model.openings || []).some(opening => pointInOpening(opening, point))) return 'Inside opening';
  if (inShadow(model.column, model.shadows || [], point)) return 'Opening shadow (§6.4.2(3))';
  return null;
}

const SAMPLES = 2048;

export function effectiveIntervals(model, r) {
  const { column } = model;
  const u = perimeterAtOffset(column, r);
  // Fast path: no openings and a circle round the whole path lies inside the slab, so every point counts.
  const reach = (column.shape === 'circular' ? column.diameter / 2 : Math.hypot(column.cx, column.cy) / 2) + r;
  const x = column.x || 0;
  const y = column.y || 0;
  const { slab } = model;
  if (!(model.openings || []).length && !(model.shadows || []).length && slab
    && x - reach >= slab.xMin && x + reach <= slab.xMax && y - reach >= slab.yMin && y + reach <= slab.yMax) {
    return { u, total: u, intervals: [{ s0: 0, s1: u, closed: true }] };
  }
  const ok = s => exclusion(model, toGlobal(column, pointAt(column, r, s))) === null;
  const step = u / SAMPLES;
  const states = Array.from({ length: SAMPLES }, (_, i) => ok(i * step));
  if (states.every(Boolean)) return { u, total: u, intervals: [{ s0: 0, s1: u, closed: true }] };
  if (!states.some(Boolean)) return { u, total: 0, intervals: [] };
  const edge = (a, b) => { // a and b straddle a transition; return the transition position
    const target = ok(a);
    for (let k = 0; k < 60; k += 1) {
      const m = (a + b) / 2;
      if (ok(m) === target) a = m; else b = m;
    }
    return (a + b) / 2;
  };
  const start = states.findIndex(state => !state); // begin scanning at an excluded sample
  const intervals = [];
  let open = null;
  for (let k = 1; k <= SAMPLES; k += 1) {
    const i = (start + k) % SAMPLES;
    const prev = (start + k - 1) % SAMPLES;
    const sPrev = (start + k - 1) * step;
    const sNow = (start + k) * step;
    if (states[i] && !states[prev]) open = edge(sPrev, sNow);
    if (!states[i] && states[prev] && open !== null) {
      intervals.push({ s0: open, s1: edge(sPrev, sNow), closed: false });
      open = null;
    }
  }
  const norm = intervals.map(item => {
    const shift = Math.floor(item.s0 / u) * u;
    return { ...item, s0: item.s0 - shift, s1: item.s1 - shift };
  }).filter(item => item.s1 - item.s0 > 1e-6);
  return { u, total: norm.reduce((sum, item) => sum + item.s1 - item.s0, 0), intervals: norm };
}

// Offset r at which the effective length reaches `target` (bisection; effective length grows with r).
export function offsetForLength(model, target, cache = effectiveIntervals) {
  let low = 0;
  let high = 1000;
  while (cache(model, high).total < target) {
    high *= 2;
    if (high > 1e6) return null;
  }
  for (let k = 0; k < 50; k += 1) {
    const mid = (low + high) / 2;
    if (cache(model, mid).total < target) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

// Global polylines of the effective intervals, for drawing.
export function intervalPolylines(model, r, intervals) {
  const { column } = model;
  return intervals.map(item => {
    const steps = Math.max(8, Math.ceil((item.s1 - item.s0) / 25));
    return Array.from({ length: steps + 1 }, (_, i) => toGlobal(column, pointAt(column, r, item.s0 + ((item.s1 - item.s0) * i) / steps)));
  });
}
