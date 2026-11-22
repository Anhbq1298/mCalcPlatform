// Automatic link arrangements with a radial spacing s_r:
//   grid  – links on the slab bar grid: lines start at the corners of the first ring (s0 outside the faces)
//           and step at the bar spacing; ring k holds the grid points on the rectangle s0 + k·s_r out;
//   rails – stud rails (DECON / The Concrete Centre practice): orthogonal rails perpendicular to each face
//           first (outer rails in line with the column edges, ≤ 1.5d and ≥ 100 mm apart, plus `extra`
//           rails per face — on the short faces first for b/h > 2), and m corner rails fanning out at
//           equal angles only on the perimeters where the corner gap needs them (s_t) or u_out,ef does.
// Each perimeter is one layer of the check: its legs count for A_sw (Eq. 6.52) and its tangential gaps are
// measured along the control path at the layer offset (grid rings: straight distances between links).
import { pathPieces, toGlobal } from './geometry.mjs';
import { exclusion } from './perimeters.mjs';
import { ringGaps, thinGrid } from './grid-thin.mjs';

export const ARRANGEMENTS = {
  grid: 'Links on the slab bar grid',
  rails: 'Stud rails (orthogonal, corner rails where needed)',
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

// Local points of one perimeter of stud rails at offset o (mm from the column face): orthogonal rails on
// the faces (`extra` per face, short faces first when b/h > 2) and `corner` fan rails at each corner.
function railPoints(column, o, d, { extra = 0, corner = 0 } = {}) {
  if (column.shape === 'circular') {
    const n = 8 + 2 * extra;
    const R = column.diameter / 2 + o;
    return Array.from({ length: n }, (_, i) => ({ x: R * Math.cos((2 * Math.PI * i) / n), y: R * Math.sin((2 * Math.PI * i) / n) }));
  }
  const a = column.cx / 2;
  const b = column.cy / 2;
  const ratio = Math.max(a, b) / Math.min(a, b);
  // b/h ≤ 2: the extra rails go to every face; b/h > 2: to the short faces first, the long faces get the rest.
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


// Layers of an automatic arrangement: offsets s0 + k·s_r up to the outermost layer within outerK·d of
// u_out,ef (§9.4.3(4) and the Note to §6.4.5(4)), at least two perimeters. With uReq (Fig. 6.22 applies)
// layers are added until the effective outer perimeter reaches the length Eq. 6.54 requires. Radial rails
// are added in pairs from the entered n_tang (a minimum) until s_t ≤ 1.5d inside u1 and u_out,ef is reached.
export function arrangedLayers({ model, d, aOut, type, sr, st, diameter, shape, first, outerK, legGap = 0, uReq = null, aswReq = 0, thin = false, fck = 30, fyk = 500, onBars = false, extra = 0 }) {
  if (!(sr > 0)) return { layers: [], reason: 'Enter a radial spacing s_r > 0.' };
  if (type === 'grid' && !(st > 0)) return { layers: [], reason: 'Enter a grid spacing s_t > 0.' };
  const column = model.column;
  // No link is placed where it would be ineffective: outside the slab, in an opening or in its shadow.
  const placeable = p => !exclusion(model, toGlobal(column, p));
  const required = Math.max(aOut - outerK * d, first);
  const minCount = Math.max(2, Math.ceil((required - first) / sr - 1e-9) + 1);
  const legArea1 = (Math.PI * diameter * diameter) / 4; // one leg
  const legArea = legArea1 * (shape === 'double' ? 2 : 1); // one link
  const place = corner => {
    const build = count => {
      const offsets = Array.from({ length: count }, (_, i) => first + i * sr);
      return offsets.map((offset, k) => ({
        offset, diameter, shape, start: 0, omitted: [], arrangement: type,
        points: (type === 'grid' ? gridFor(column, offsets, st, k, onBars) : railPoints(column, offset, d, { extra, corner }))
          .filter(placeable)
          .map(p => ({ ...p, s: arcLengthAt(column, offset, p) })),
      }));
    };
    // Corner rails start only on the perimeters that need them: where the corner gap without them exceeds
    // the s_t limit (1.5d inside u1, 2d outside). They are never added for A_sw (that is the bar Ø and the
    // orthogonal rails), so near the column the studs do not crowd round the corner.
    const trim = layers => (type === 'rails' && column.shape !== 'circular' ? layers.map(layer => {
      const plain = layer.points.filter(p => !p.fan);
      const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
      return pathGap(model, { ...layer, points: plain }) <= limit + 1e-9 ? { ...layer, points: plain } : layer;
    }) : layers);
    let layers = trim(build(minCount));
    // Rails are extended until u_out,ef reaches u_out,req; gaps > 2d count only 2d, so if the slab edge (or
    // MAX_LAYERS) comes first the layers stay at a_out and more corner rails are tried.
    let reached = true;
    if (uReq > 0) {
      let trial = layers;
      let count = minCount;
      while (outerPerimeterEf(trial.at(-1).points, d, outerK).u < uReq - 1e-6) {
        if (count >= MAX_LAYERS || trial.some(layer => !layer.points.length)) { trial = null; break; }
        trial = trim(build(++count));
      }
      if (trial && !trial.some(layer => !layer.points.length)) layers = trial;
      else reached = false;
    }
    // Grid: rings at whole multiples of the bar spacing while every limit still holds (see grid-thin.mjs).
    if (type === 'grid' && thin && uReq > 0 && !(onBars && Math.abs(column.rotation || 0) > 1e-9)) {
      layers = thinGrid(layers, { column, d, sr, aswReq, legArea, leg: legArea1, gap: layer => ringGaps(layer.points).max,
        minLeg: (s, g) => (0.08 * Math.sqrt(fck) / fyk) * (s * g) / 1.5 });
    }
    const inside = type !== 'rails' || layers.filter(layer => layer.offset <= 2 * d).every(layer => pathGap(model, layer) <= 1.5 * d + 1e-9);
    const strong = layers.every(layer => layer.points.length * legArea >= aswReq - 1e-6);
    return { layers, reached, inside, strong, corner };
  };
  // Stud rails: the fewest corner rails per corner (0 = orthogonal only) that keep s_t and reach u_out,req.
  let best = place(type === 'rails' ? 0 : 0);
  if (type === 'rails' && column.shape !== 'circular') {
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
