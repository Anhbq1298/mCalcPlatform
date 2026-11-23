// Automatic link arrangements with a radial spacing s_r:
//   grid  – links on the slab bar grid: lines start at the corners of the first ring (s0 outside the faces)
//           and step at the bar spacing; ring k holds the grid points on the rectangle s0 + k·s_r out;
//   radial – links on radial lines (DECON / The Concrete Centre practice): orthogonal lines perpendicular to each face
//           first (outer lines in line with the column edges, ≤ 1.5d and ≥ 100 mm apart, plus `extra`
//           lines per face — on the short faces first for b/h > 2), and m corner lines fanning out at
//           equal angles only on the perimeters where the corner gap needs them (s_t) or u_out,ef does.
// Each perimeter is one layer of the check: its legs count for A_sw (Eq. 6.52) and its tangential gaps are
// measured along the control path at the layer offset (grid rings: straight distances between links).
import { distanceToColumn, pathPieces, toGlobal } from './geometry.mjs';
import { exclusion } from './perimeters.mjs';
import { barGridPoints, openGap, ringGaps, thinGrid } from './grid-thin.mjs';

export const ARRANGEMENTS = {
  grid: 'Grid arrangement (links on the slab bar grid)',
  radial: 'Radial arrangement (lines perpendicular to the faces, corner lines where needed)',
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

// Rails across one face of half-length `half`: the outer two in line with the column edges, then evenly
// at ≤ 1.5d and ≥ 100 mm, plus `extra` more on that face.
function faceRails(half, d, extra) {
  const base = Math.max(2, Math.ceil((2 * half) / (1.5 * d) - 1e-9) + 1);
  const most = Math.max(2, Math.floor((2 * half) / 100 + 1e-9) + 1);
  return spread(-half, half, Math.min(most, base + extra));
}

// Local points of one perimeter of the radial arrangement at offset o (mm from the column face): orthogonal lines on
// the faces (`extra` per face, short faces first when b/h > 2) and `corner` fan lines at each corner.
function radialPoints(column, o, d, { extra = 0, corner = 0 } = {}) {
  if (column.shape === 'circular') {
    const n = 8 + 2 * extra;
    const R = column.diameter / 2 + o;
    return Array.from({ length: n }, (_, i) => ({ x: R * Math.cos((2 * Math.PI * i) / n), y: R * Math.sin((2 * Math.PI * i) / n) }));
  }
  const a = column.cx / 2;
  const b = column.cy / 2;
  const ratio = Math.max(a, b) / Math.min(a, b);
  // b/h ≤ 2: the extra lines go to every face; b/h > 2: to the short faces first, the long faces get the rest.
  const shortX = a <= b;
  const toShort = ratio > 2 ? extra : Math.ceil(extra / 2);
  const toLong = ratio > 2 ? Math.max(0, extra - 2) : Math.floor(extra / 2);
  const points = [];
  for (const x of faceRails(a, d, shortX ? toShort : toLong)) points.push({ x, y: b + o }, { x, y: -b - o });
  for (const y of faceRails(b, d, shortX ? toLong : toShort)) points.push({ x: a + o, y }, { x: -a - o, y });
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (let j = 1; j <= corner; j += 1) {
      const t = (j * Math.PI) / (2 * (corner + 1));
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
// Bar set-out for the grid: bars split evenly about the column centre lines (x = ±s/2, ±3s/2, …) unless
// head.mjs passes the origin of a drop section. The first ring goes on the first bar line beyond each face
// that lies 0.3d–0.5d from it, so the links sit at bar intersections; where there is none, the ring keeps
// its exact offset with the links along the bars (a link can sit anywhere along the bar it hooks).
function barSetOut(column, s, origin, d) {
  const pick = (half, o) => {
    for (const shift of origin.fixed ? [0] : [0, s / 2]) {
      const start = o + shift;
      const x = start + Math.ceil((half + 0.3 * d - start) / s - 1e-9) * s;
      if (x - half <= 0.5 * d + 1e-9) return { line: x, shift };
    }
    return { line: null, shift: 0 };
  };
  const px = pick(column.cx / 2, origin.x);
  const py = pick(column.cy / 2, origin.y);
  return { spacing: s, origin: { x: origin.x + px.shift, y: origin.y + py.shift }, snap: { x: px.line, y: py.line }, shifted: px.shift > 0 || py.shift > 0 };
}

function gridFor(column, offsets, st, k, onBars) {
  if (onBars && onBars.spacing && column.shape !== 'circular' && Math.abs(column.rotation || 0) < 1e-9) return barGridPoints(column, offsets[k], onBars.spacing, onBars.origin, onBars.multiple ?? 1, { ...onBars.snap, delta: offsets[k] - offsets[0] });
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

// Largest gap between consecutive links along the path at a layer (for the corner-line search). On a path cut
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


// Layers of an automatic arrangement: offsets s0 + k·s_r up to the outermost layer within outerK·d of
// u_out,ef (§9.4.3(4) and the Note to §6.4.5(4)), at least two perimeters. With uReq (Fig. 6.22 applies)
// layers are added until the effective outer perimeter reaches the length Eq. 6.54 requires. Radial lines
// are added in pairs from the entered n_tang (a minimum) until s_t ≤ 1.5d inside u1 and u_out,ef is reached.
export function arrangedLayers({ model, d, aOut, type, sr, st, diameter, shape, first, outerK, legGap = 0, uReq = null, aswReq = 0, thin = false, fck = 30, fyk = 500, onBars = false, extra = 0, maxOffset = Infinity, barOrigin = null, maxMultiple = 6 }) {
  if (!(sr > 0)) return { layers: [], reason: 'Enter a radial spacing s_r > 0.' };
  if (type === 'grid' && !(st > 0)) return { layers: [], reason: 'Enter a grid spacing s_t > 0.' };
  const column = model.column;
  // No link is placed where it would be ineffective: outside the slab, in an opening or in its shadow.
  const placeable = (p, index) => {
    const point = toGlobal(column, p);
    const limit = index === 0 ? Math.min(maxOffset, 0.5 * d) : maxOffset;
    return !exclusion(model, point) && distanceToColumn(column, point) <= limit + 1e-9;
  };
  const required = Math.max(aOut - outerK * d, first);
  const minCount = Math.max(2, Math.ceil((required - first) / sr - 1e-9) + 1);
  const maxCount = Math.min(MAX_LAYERS, Math.floor((maxOffset - first) / sr + 1e-9) + 1);
  if (minCount > maxCount) return { layers: [], reason: 'The reinforcement zone cannot fit the required layers at this radial spacing.' };
  const legArea1 = (Math.PI * diameter * diameter) / 4; // one leg
  const legArea = legArea1 * (shape === 'double' ? 2 : 1); // one link
  const place = corner => {
    const bars = onBars && column.shape !== 'circular' && Math.abs(column.rotation || 0) < 1e-9 ? barSetOut(column, st, barOrigin ?? { x: st / 2, y: st / 2, fixed: true }, d) : null;
    const build = (count, multiple = 1) => {
      const offsets = Array.from({ length: count }, (_, i) => first + i * sr);
      return offsets.map((offset, k) => ({
        offset, diameter, shape, start: 0, omitted: [], arrangement: type, ...(bars ? { multiple } : {}),
        points: (type === 'grid' ? gridFor(column, offsets, st, k, bars ? { ...bars, multiple } : onBars) : radialPoints(column, offset, d, { extra, corner }))
          .filter(point => placeable(point, k))
          .map(p => ({ ...p, s: arcLengthAt(column, offset, p) })),
      }));
    };
    // Corner lines start only on the perimeters that need them: where the corner gap without them exceeds
    // the s_t limit (1.5d inside u1, 2d outside). They are never added for A_sw (that is the bar Ø and the
    // orthogonal lines), so near the column the links do not crowd round the corner.
    const trim = layers => (type === 'radial' && column.shape !== 'circular' ? layers.map(layer => {
      const plain = layer.points.filter(p => !p.fan);
      const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
      return pathGap(model, { ...layer, points: plain }) <= limit + 1e-9 ? { ...layer, points: plain } : layer;
    }) : layers);
    let layers = trim(build(minCount));
    // Rails are extended until u_out,ef reaches u_out,req; gaps > 2d count only 2d, so if the slab edge (or
    // MAX_LAYERS) comes first the layers stay at a_out and more corner lines are tried.
    let reached = true;
    if (uReq > 0) {
      let trial = layers;
      let count = minCount;
      while (outerPerimeterEf(trial.at(-1).points, d, outerK).u < uReq - 1e-6) {
        if (count >= maxCount || trial.some(layer => !layer.points.length)) { trial = null; break; }
        trial = trim(build(++count));
      }
      if (trial && !trial.some(layer => !layer.points.length)) layers = trial;
      else reached = false;
    }
    // Grid: rings at whole multiples of the bar spacing while every limit still holds (see grid-thin.mjs).
    // Applies everywhere: internal columns (with or without a drop), edge and corner columns, and the slab
    // around a drop. A ring cut by a slab edge keeps its two end links and the gap across the cut is skipped.
    if (type === 'grid' && thin && bars) {
      // A ring passes when s_t (straight gaps, ≤ 1.5d within 2d, ≤ 2d beyond), A_sw (Eq. 6.52) and Eq. 9.11
      // hold with every m-th bar line (counted from the lines nearest the column centre).
      const span = layer => {
        const at = model.intervalsAt?.(layer.offset);
        return !at || at.intervals.every(item => item.closed) ? null : at;
      };
      const gapOf = layer => (span(layer) ? openGap(layer.points, span(layer)) : ringGaps(layer.points).max);
      const ok = layer => {
        const g = gapOf(layer);
        const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
        return layer.points.length && g <= limit + 1e-9 && layer.points.length * legArea >= aswReq - 1e-6 && legArea1 >= (0.08 * Math.sqrt(fck) / fyk) * (sr * g) / 1.5 - 1e-9;
      };
      // Dense to sparse from the column outward: M_k is the widest multiple ring k passes with on its own;
      // ring k takes the largest whole multiple of the first ring's m₁ not above min(M_k, M_k+1, …), so the
      // multiples never decrease outward and every ring stays on the first ring's bars (m₁ = min of all M).
      const MAX = Math.max(1, Math.min(6, maxMultiple));
      const ring = (k, m) => build(layers.length, m)[k];
      const widest = layers.map((_, k) => { for (let m = MAX; m >= 2; m -= 1) if (ok(ring(k, m))) return m; return 1; });
      const cap = widest.map((_, k) => Math.min(...widest.slice(k)));
      const m1 = cap[0];
      if (m1 > 1 || cap.some(c => c > 1)) layers = layers.map((layer, k) => { const m = Math.floor(cap[k] / m1) * m1; return m > 1 ? ring(k, m) : layer; });
    } else if (type === 'grid' && thin && !(onBars && Math.abs(column.rotation || 0) > 1e-9)) {
      // span: the effective stretches of a ring cut by a slab edge or an opening shadow (null when closed).
      const span = layer => {
        const at = model.intervalsAt?.(layer.offset);
        return !at || at.intervals.every(item => item.closed) ? null : at;
      };
      layers = thinGrid(layers, { column, d, sr, aswReq, legArea, leg: legArea1, span, gap: layer => (span(layer) ? openGap(layer.points, span(layer)) : ringGaps(layer.points).max),
        minLeg: (s, g) => (0.08 * Math.sqrt(fck) / fyk) * (s * g) / 1.5 });
    }
    // s_t ≤ 1.5d inside u1; outside, ≤ 2d unless Fig. 6.22 applies (internal column, then a wider gap only
    // shortens u_out,ef). Edge and corner columns, openings and drops keep s_t ≤ 2d as a check out to a_out.
    const stLimit = layer => (layer.offset <= 2 * d ? 1.5 * d : uReq > 0 ? Infinity : 2 * d);
    const inside = type !== 'radial' || layers.every(layer => pathGap(model, layer) <= stLimit(layer) + 1e-9);
    const strong = layers.every(layer => layer.points.length * legArea >= aswReq - 1e-6);
    return { layers, reached, inside, strong, corner };
  };
  // Radial: the fewest corner lines per corner (0 = orthogonal only) that keep s_t and reach u_out,req.
  let best = place(0);
  if (type === 'radial' && column.shape !== 'circular') {
    for (let m = 1; !(best.reached && best.inside) && m <= 8; m += 1) best = place(m);
  }
  const { layers } = best;
  let note = best.strong ? null : `A_sw per perimeter (${layers[0] ? (layers[0].points.length * legArea).toFixed(0) : 0} mm²) is below the ${aswReq.toFixed(0)} mm² Eq. 6.52 needs with this arrangement.`;
  if (!best.reached) note = (note ? note + ' ' : '') + `Rails are not extended: u_out,ef does not reach u_out,req = ${uReq.toFixed(0)} mm (gaps > 2d count only 2d, Fig. 6.22 B).`;
  // Two-leg links: the legs sit ± legGap/2 either side of the link centre, so the width must be below the
  // closest distance between link centres of a layer or adjacent links would overlap.
  if (shape === 'double' && legGap > 0) {
    const tight = layers.some(({ points }) => points.some((p, i) => points.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) <= legGap + 1e-9)));
    if (tight) return { layers: [], reason: `No valid link count with two-leg links ${legGap} mm wide: the width must be smaller than the spacing between links; reduce it or use single-leg links.` };
  }
  const empty = layers.findIndex(layer => !layer.points.length);
  if (empty >= 0) return { layers: [], reason: `Layer L${empty + 1} has no link position inside the slab.` };
  layers.forEach(layer => { layer.links = layer.points.length; });
  return { layers, first, sr, note, corner: best.corner, strong: best.strong };
}
