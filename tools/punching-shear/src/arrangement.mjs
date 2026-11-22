// Automatic link arrangements with a fixed radial spacing s_r (default 150 mm):
//   grid      – an orthogonal grid parallel to the column faces: grid lines at the ring positions
//               ±(c/2 + s0 + k·s_r) and across the column width at ≤ s_t; ring k holds the grid points
//               on the rectangle at s0 + k·s_r from the faces;
//   radial    – rails as in Fig. 6.22 A: on each face the rails of the cruciform layout, plus m rails
//               fanning out from each column corner at equal angles; m is the smallest number that keeps
//               s_t ≤ 1.5d inside u1 and lets u_out,ef reach u_out,req (circular columns: n equal rays);
//   cruciform – rails perpendicular to the faces only (EN 1992-1-1 Fig. 6.22 B): on each face the outer
//               rails in line with the column edges and enough between them for ≤ 1.5d apart; when
//               u_out,ef falls short, parallel rails are added beside each arm at the same spacing (the arm
//               widens; longer rails alone cannot help, the corner gaps count at most 2d).
// Each perimeter (rail studs at one distance, or one grid ring) is one layer of the check: its legs are
// counted for A_sw (Eq. 6.52) and its tangential gaps are measured along the control path at the layer
// offset (grid points beyond a column corner are projected onto the rounded path). For cruciform rails
// the gap around a column corner is not a tangential spacing: Fig. 6.22 B shows it larger than 1.5d inside
// u1 and covers it by the reduced u_out,ef (interpretation, stated in the Help).
import { pathPieces, toGlobal } from './geometry.mjs';
import { exclusion } from './perimeters.mjs';
import { ringGaps, thinGrid } from './grid-thin.mjs';

export const ARRANGEMENTS = {
  grid: 'Orthogonal grid',
  radial: 'Radial rails',
  cruciform: 'Cruciform rails',
};

// Arc length of the closest point on the path at offset r to a local point.
export function arcLengthAt(column, r, point) {
  let best = { dist: Infinity, s: 0 };
  let start = 0;
  for (const piece of pathPieces(column, r)) {
    let t;
    let q;
    if (piece.kind === 'line') {
      const dx = piece.x1 - piece.x0;
      const dy = piece.y1 - piece.y0;
      t = piece.length ? Math.min(1, Math.max(0, ((point.x - piece.x0) * dx + (point.y - piece.y0) * dy) / (piece.length ** 2))) : 0;
      q = { x: piece.x0 + dx * t, y: piece.y0 + dy * t };
    } else {
      let angle = Math.atan2(point.y - piece.cy, point.x - piece.cx);
      while (angle < piece.from - 1e-9) angle += 2 * Math.PI;
      while (angle > piece.from + 2 * Math.PI) angle -= 2 * Math.PI;
      t = Math.min(1, Math.max(0, (angle - piece.from) / (piece.to - piece.from)));
      const a = piece.from + (piece.to - piece.from) * t;
      q = { x: piece.cx + piece.R * Math.cos(a), y: piece.cy + piece.R * Math.sin(a) };
    }
    const dist = Math.hypot(q.x - point.x, q.y - point.y);
    if (dist < best.dist - 1e-9) best = { dist, s: start + t * piece.length };
    start += piece.length;
  }
  return best.s;
}

const spread = (from, to, n) => (n <= 1 ? [(from + to) / 2] : Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1)));

// Local points of one perimeter of rails at offset o (mm from the column face).
function railPoints(column, type, rails, o, d) {
  if (column.shape === 'circular') {
    const R = column.diameter / 2 + o;
    return Array.from({ length: rails }, (_, i) => ({ x: R * Math.cos((2 * Math.PI * i) / rails), y: R * Math.sin((2 * Math.PI * i) / rails) }));
  }
  const a = column.cx / 2;
  const b = column.cy / 2;
  const points = [];
  if (type === 'cruciform') {
    // Rails in line with the column edges and evenly between them, ≤ 1.5d apart along each face, plus
    // `rails` extra rails on each side of every arm at the same spacing.
    const along = half => {
      const base = spread(-half, half, Math.max(2, Math.ceil((2 * half) / (1.5 * d) - 1e-9) + 1));
      const step = base[1] - base[0];
      const extra = Array.from({ length: rails }, (_, k) => half + (k + 1) * step);
      return [...extra.map(v => -v), ...base, ...extra];
    };
    for (const x of along(a)) points.push({ x, y: b + o }, { x, y: -b - o });
    for (const y of along(b)) points.push({ x: a + o, y }, { x: -a - o, y });
    return points;
  }
  // Face rails as for the cruciform layout, then `rails` (= m) rails per corner at equal angles between
  // the two face normals, so the gap around a corner is (π/2)·o/(m + 1) at offset o.
  const along = half => spread(-half, half, Math.max(2, Math.ceil((2 * half) / (1.5 * d) - 1e-9) + 1));
  for (const x of along(a)) points.push({ x, y: b + o }, { x, y: -b - o });
  for (const y of along(b)) points.push({ x: a + o, y }, { x: -a - o, y });
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (let j = 1; j <= rails; j += 1) {
      const t = (j * Math.PI) / (2 * (rails + 1));
      const phi = Math.atan2(sy * Math.sin(t), sx * Math.cos(t));
      points.push({ x: sx * a + o * Math.cos(phi), y: sy * b + o * Math.sin(phi), fan: true });
    }
  }
  return points;
}

function gridLines(half, offsets, st) {
  const inner = half + offsets[0];
  let lines;
  {
    // Flexural bar lines: symmetric about the column, one bar line at s0 outside each face and then at the
    // bar spacing inward; a closing bar on the centre line where the middle gap would exceed the spacing.
    // Middle of the column: a centre bar when the two nearest bars are more than s apart; when they would
    // be closer than s/2 they are replaced by the centre bar, so no bar gap is below s/2 or above 1.25s.
    lines = [];
    let v = inner;
    for (; v > 1e-6; v -= st) lines.push(v, -v);
    const smallest = Math.min(...lines.map(Math.abs));
    if (Math.abs(v) < 1e-6 || 2 * smallest > st + 1e-9) lines.push(0);
    else if (2 * smallest < st / 2 - 1e-9) lines = [...lines.filter(x => Math.abs(Math.abs(x) - smallest) > 1e-6), 0];
  }
  for (const o of offsets.slice(1)) lines.push(half + o, -half - o);
  return [...new Set(lines.map(v => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
}

function gridPoints(column, offsets, st, k, onBars = false) {
  const a = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const b = column.shape === 'circular' ? column.diameter / 2 : column.cy / 2;
  // Lines start at the corners of the first ring (s0 outside the faces) and step inward at exactly s_t.
  const xs = gridLines(a, offsets, st);
  const ys = gridLines(b, offsets, st);
  const o = offsets[k];
  const on = (value, edge) => Math.abs(Math.abs(value) - edge) < 1e-6;
  const points = [];
  for (const x of xs) for (const y of ys) {
    const ring = (on(x, a + o) && Math.abs(y) <= b + o + 1e-6) || (on(y, b + o) && Math.abs(x) <= a + o + 1e-6);
    if (ring) points.push({ x, y });
  }
  return points;
}

export { faceGaps, outerPerimeterEf } from './perimeter-ef.mjs';
import { faceGaps, outerPerimeterEf } from './perimeter-ef.mjs';

const MAX_LAYERS = 60;

// Grid points in column-local coordinates. On the bars with a rotated column, the grid is laid out in the
// bar (global) axes around the circumscribed rectangle of the column (its two farthest opposite points in
// each bar direction), then expressed in the column frame; offsets are measured from that rectangle.
function gridFor(column, offsets, st, k, onBars) {
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  if (!onBars || Math.abs(theta) < 1e-9 || column.shape === 'circular') return gridPoints(column, offsets, st, k, onBars);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const box = { shape: 'rectangular', cx: Math.abs(column.cx * c) + Math.abs(column.cy * s), cy: Math.abs(column.cx * s) + Math.abs(column.cy * c) };
  return gridPoints(box, offsets, st, k, true).map(p => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
}

// Whether the auto grid can sit on the flexural bar intersections (s_r = s_t = bar spacing).
export function gridOnBars(input, d) {
  const r = input.reinforcement ?? {};
  if (r.mode !== 'auto' || (r.arrangement ?? 'grid') !== 'grid' || r.enabled === false) return { on: false };
  const f = input.flexure ?? {};
  const spacing = f.sX;
  const why = !(f.sX > 0 && f.sY > 0) ? null
    : Math.abs(f.sX - f.sY) > 1e-6 ? `bar spacings differ (${f.sX} / ${f.sY} mm)`
      : spacing > 0.75 * d + 1e-9 ? `the bar spacing ${spacing} mm exceeds 0.75d = ${(0.75 * d).toFixed(0)} mm (§9.4.3(1))` : null;
  if (!(spacing > 0)) return { on: false };
  if (why) return { on: false, note: `Grid not on the flexural bars: ${why}; the entered s_r and s_t are used.` };
  return { on: true, spacing };
}

// Largest gap between consecutive links along the path at a layer (for the rail search). On a path cut
// by a slab edge the gap across the cut is not a tangential spacing and is skipped.
function pathGap(model, layer) {
  const u = pathPieces(model.column, layer.offset).reduce((sum, piece) => sum + piece.length, 0);
  const closed = model.intervalsAt ? model.intervalsAt(layer.offset).intervals.every(item => item.closed) : true;
  const s = layer.points.map(p => p.s).sort((a, b) => a - b);
  if (s.length < 2) return closed ? u : 0;
  const gaps = s.slice(1).map((v, i) => v - s[i]);
  if (closed) gaps.push(s[0] + u - s.at(-1));
  return Math.max(...gaps);
}

const MAX_RAILS = 80;

// Layers of an automatic arrangement: offsets s0 + k·s_r up to the outermost layer within outerK·d of
// u_out,ef (§9.4.3(4) and the Note to §6.4.5(4)), at least two perimeters. With uReq (Fig. 6.22 applies)
// layers are added until the effective outer perimeter reaches the length Eq. 6.54 requires. Radial rails
// are added in pairs from the entered n_tang (a minimum) until s_t ≤ 1.5d inside u1 and u_out,ef is reached.
export function arrangedLayers({ model, d, aOut, type, sr, st, rails, diameter, shape, first, outerK, legGap = 0, uReq = null, aswReq = 0, thin = false, fck = 30, fyk = 500, onBars = false }) {
  if (!(sr > 0)) return { layers: [], reason: 'Enter a radial spacing s_r > 0.' };
  if (type === 'grid' && !(st > 0)) return { layers: [], reason: 'Enter a grid spacing s_t > 0.' };
  const column = model.column;
  if (type === 'cruciform' && column.shape === 'circular') return { layers: [], reason: 'Cruciform rails need a rectangular column; use radial rails or the grid.' };
  // No link is placed where it would be ineffective: outside the slab, in an opening or in its shadow.
  const placeable = p => !exclusion(model, toGlobal(column, p));
  const required = Math.max(aOut - outerK * d, first);
  const minCount = Math.max(2, Math.ceil((required - first) / sr - 1e-9) + 1);
  const place = n => {
    const build = count => {
      const offsets = Array.from({ length: count }, (_, i) => first + i * sr);
      return offsets.map((offset, k) => ({
        offset, diameter, shape, start: 0, omitted: [], arrangement: type,
        points: (type === 'grid' ? gridFor(column, offsets, st, k, onBars) : railPoints(column, type, n, offset, d))
          .filter(placeable)
          .map(p => ({ ...p, s: arcLengthAt(column, offset, p) })),
      }));
    };
    let layers = build(minCount);
    // Rails keep their number outward and gaps > 2d count only 2d, so u_out,ef may stop growing short of
    // the requirement; if extending reaches the slab edge (or MAX_LAYERS) first, the layers stay at a_out.
    let reached = true;
    if (uReq > 0) {
      let trial = layers;
      let count = minCount;
      while (outerPerimeterEf(trial.at(-1).points, d, outerK).u < uReq - 1e-6) {
        if (count >= MAX_LAYERS || trial.some(layer => !layer.points.length)) { trial = null; break; }
        trial = build(++count);
      }
      if (trial && !trial.some(layer => !layer.points.length)) layers = trial;
      else reached = false;
    }
    // Grid: outer rings at whole multiples of s_t while every limit still holds (see grid-thin.mjs).
    const legArea1 = (Math.PI * diameter * diameter) / 4; // one leg (Eq. 9.11)
    // Not with a rotated column on the bars: the rings there are rectangles in the bar axes, not the column's.
    if (type === 'grid' && thin && uReq > 0 && !(onBars && Math.abs(column.rotation || 0) > 1e-9)) {
      layers = thinGrid(layers, { column, d, sr, aswReq, legArea: legArea1 * (shape === 'double' ? 2 : 1), leg: legArea1, gap: layer => ringGaps(layer.points).max,
        minLeg: (s, g) => (0.08 * Math.sqrt(fck) / fyk) * (s * g) / 1.5 });
    }
    // Radial: a corner rail starts only where it is needed. On a perimeter where the corner gap without
    // the fan rails stays within the s_t limit and the A_sw of Eq. 6.52 is met by the face rails, the fan
    // studs are left out (near the column they would crowd round the corner).
    if (type === 'radial' && column.shape !== 'circular') {
      const leg = (Math.PI * diameter * diameter) / 4 * (shape === 'double' ? 2 : 1);
      layers = layers.map(layer => {
        const plain = layer.points.filter(p => !p.fan);
        const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
        const gap = pathGap(model, { ...layer, points: plain });
        return gap <= limit + 1e-9 && plain.length * leg >= aswReq - 1e-6 ? { ...layer, points: plain } : layer;
      });
    }
    const inside = type !== 'radial' || layers.filter(layer => layer.offset <= 2 * d).every(layer => pathGap(model, layer) <= 1.5 * d + 1e-9);
    // Eq. 6.52: every perimeter carries at least the required A_sw (legs × bar area).
    const legArea = (Math.PI * diameter * diameter) / 4 * (shape === 'double' ? 2 : 1);
    const strong = layers.every(layer => layer.points.length * legArea >= aswReq - 1e-6);
    return { layers, reached, inside, strong, rails: n };
  };
  // Radial: the fewest corner rails (rectangular) or rays (circular) that satisfy s_t ≤ 1.5d inside u1 and
  // reach u_out,req; if none up to the limit does, the largest tried is kept and the checks report it.
  const circular = column.shape === 'circular';
  // Cruciform: the fewest extra rails beside each arm that reach u_out,req and the Eq. 6.52 A_sw.
  let best = place(type === 'radial' ? (circular ? 8 : 1) : type === 'cruciform' ? 0 : rails);
  if (type === 'radial' || type === 'cruciform') {
    const limit = type === 'cruciform' ? 10 : circular ? MAX_RAILS : 12;
    for (let n = best.rails; !(best.reached && best.inside && best.strong) && n < limit; ) {
      n += type === 'radial' && circular ? 2 : 1;
      best = place(n);
    }
  }
  const { layers } = best;
  let note = best.strong ? null : `A_sw per perimeter (${layers[0] ? (layers[0].points.length * Math.PI * diameter * diameter / 4 * (shape === 'double' ? 2 : 1)).toFixed(0) : 0} mm²) is below the ${aswReq.toFixed(0)} mm² Eq. 6.52 needs with this arrangement: ${type === 'grid' ? 'reduce the grid spacing s_t' : 'no number of rails up to the limit gives it'} or use a larger bar Ø.`;
  if (!best.reached) {
    // Limit of u_out,ef for rails of any length (every widening gap counted as 2d).
    const limit = type === 'grid' ? null : outerPerimeterEf(railPoints(column, type, best.rails, 1e6, d), d, outerK).u;
    const more = 'use the grid';
    note = (note ? note + " " : "") + `Rails are not extended: ${limit ? `u_out,ef can reach at most ${limit.toFixed(0)} mm with this arrangement` : 'u_out,ef does not reach the requirement'} (gaps > 2d count only 2d, Fig. 6.22 B) < u_out,req = ${uReq.toFixed(0)} mm; ${more}.`;
  }
  // Two-leg links: the legs sit ± legGap/2 either side of the link centre, so the width must be below the
  // closest distance between link centres of a layer or adjacent links would overlap.
  if (shape === 'double' && legGap > 0) {
    const tight = layers.some(({ points }) => points.some((p, i) => points.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) <= legGap + 1e-9)));
    if (tight) return { layers: [], reason: `No valid link count with two-leg links ${legGap} mm wide: the width must be smaller than the spacing between links; reduce it or use single-leg links.` };
  }
  const empty = layers.findIndex(layer => !layer.points.length);
  if (empty >= 0) return { layers: [], reason: `Layer L${empty + 1} has no link position inside the slab.` };
  layers.forEach(layer => { layer.links = layer.points.length; });
  return { layers, first, sr, note, rails: best.rails };
}
