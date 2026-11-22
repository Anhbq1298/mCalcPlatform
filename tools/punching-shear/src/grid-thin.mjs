// Orthogonal grid: wider tangential spacing on the outer rings, in whole multiples of the inner grid
// spacing (s_t, 2s_t, 3s_t …) so every kept link stays on the inner grid lines. Ring by ring from the
// column outward, the largest multiple m (never smaller than on the ring inside it) is kept for which
//   - the largest gap along the control path at the ring is ≤ 1.5d inside u1 and ≤ 2d outside (§9.4.3(1)),
//     so u_out,ef keeps its full length (no gap > 2d, Fig. 6.22 A);
//   - the ring still carries the A_sw of Eq. 6.52;
//   - one leg still meets Eq. 9.11 with that gap as s_t.
// Every ring, the first included, takes the widest multiple the limits allow; ring corners are always kept,
// and so are the two end links of a ring cut by a slab edge. Applied at every column position, inside a
// drop and in the slab around it.
const near = (a, b) => Math.abs(a - b) < 1e-6;

// Gaps between neighbouring links of a closed grid ring, as straight distances in plan (the ring is a
// rectangle; projecting its corner points onto the rounded control path would understate the gaps).
export function ringGaps(points) {
  if (points.length < 2) return { max: 0, gaps: [] };
  const ring = [...points].sort((p, q) => Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x));
  const gaps = ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return { length: Math.hypot(q.x - p.x, q.y - p.y), s0: p.s, from: { x: p.x, y: p.y }, to: { x: q.x, y: q.y } };
  });
  return { max: Math.max(...gaps.map(gap => gap.length)), gaps };
}

// Gaps between neighbouring links of a grid ring cut by a slab edge or an opening shadow, as straight
// distances, ordered along the path. A gap that spans an ineffective stretch of the path (the cut) is not a
// tangential spacing and is left out; `span` = { intervals, u } of the path at the ring (perimeters.mjs).
export function openGaps(points, span = null) {
  const ring = [...points].sort((p, q) => p.s - q.s);
  const inside = (a, b) => !span || span.intervals.some(({ s0, s1 }) => [0, span.u].some(shift => s0 - 1e-6 <= a + shift && b + shift <= s1 + 1e-6));
  const gaps = ring.slice(1).map((q, i) => {
    const p = ring[i];
    return { length: Math.hypot(q.x - p.x, q.y - p.y), s0: p.s, from: { x: p.x, y: p.y }, to: { x: q.x, y: q.y }, keep: inside(p.s, q.s) };
  }).filter(gap => gap.keep).map(({ keep, ...gap }) => gap);
  return { max: Math.max(0, ...gaps.map(gap => gap.length)), gaps };
}
export const openGap = (points, span) => openGaps(points, span).max;

function thinRing(layer, column, m, open = false) {
  if (m <= 1) return layer.points;
  const a = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const b = column.shape === 'circular' ? column.diameter / 2 : column.cy / 2;
  const ex = a + layer.offset;
  const ey = b + layer.offset;
  // Positions along each side, counted from the nearer end of the side (the grid lines start at the ring
  // corners), so both corners and every m-th line from them stay; where the two counts meet in the middle
  // and leave more than m steps (or more than m grid steps of length), the middle line(s) stay too.
  const along = values => {
    const sorted = [...new Set(values.map(v => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
    const n = sorted.length;
    const step = n > 1 ? sorted[1] - sorted[0] : 0; // the grid step (from the corner)
    const keep = new Set(sorted.map((_, i) => i).filter(i => Math.min(i, n - 1 - i) % m === 0));
    for (let changed = true; changed;) {
      changed = false;
      const kept = [...keep].sort((p, q) => p - q);
      for (let k = 1; k < kept.length; k += 1) {
        const wide = kept[k] - kept[k - 1] > m || sorted[kept[k]] - sorted[kept[k - 1]] > m * step + 1e-6;
        if (wide && kept[k] - kept[k - 1] > 1) { keep.add(Math.round((kept[k] + kept[k - 1]) / 2)); changed = true; }
      }
    }
    return v => keep.has(sorted.findIndex(w => near(w, v)));
  };
  const onX = layer.points.filter(p => near(Math.abs(p.y), ey)).map(p => p.x);
  const onY = layer.points.filter(p => near(Math.abs(p.x), ex)).map(p => p.y);
  const keepX = along(onX);
  const keepY = along(onY);
  // Open ring: the end links on each side of every cut (slab edge or opening shadow) stay.
  const ends = new Set();
  if (open && layer.points.length > 1) {
    const ring = [...layer.points].sort((p, q) => p.s - q.s);
    const kept = new Set(openGaps(ring, open === true ? null : open).gaps.map(gap => gap.s0));
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      if (i === ring.length - 1 || !kept.has(p.s)) { ends.add(p); ends.add(q); }
    });
  }
  return layer.points.filter(p => {
    const corner = near(Math.abs(p.x), ex) && near(Math.abs(p.y), ey);
    if (corner || ends.has(p)) return true;
    return near(Math.abs(p.y), ey) ? keepX(p.x) : keepY(p.y);
  });
}

export function thinGrid(layers, { column, d, sr, aswReq, legArea, leg, minLeg, gap, span = () => null, maxMultiple = 6 }) {
  let m = 1;
  return layers.map(layer => {
    const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
    let best = layer.points;
    for (let k = m; k <= maxMultiple; k += 1) {
      const points = thinRing(layer, column, k, span(layer) ?? false);
      const g = gap({ ...layer, points });
      const ok = g <= limit + 1e-9 && points.length * legArea >= aswReq - 1e-6 && leg >= minLeg(sr, g) - 1e-9;
      if (!ok) break;
      best = points;
      m = k;
    }
    return { ...layer, points: best, multiple: m };
  });
}

// Grid links inside a drop beyond the last ring, out to the drop edge (less cover) on the same grid lines,
// so the outer zone of the drop is reinforced on every side. Extra detailing links: not part of any
// perimeter in the checks (Eq. 6.52 and §9.4.3 use the rings only).
// Spacing as for the outer rings: whole multiples of the grid step, never denser than the last ring, as
// wide as ≤ 1.5d within 2d of the column face and ≤ 2d beyond allow, in both directions.
export function dropFillPoints({ column, layers, sr, box, d = Infinity, widen = true }) {
  if (!box || !layers.length || column.shape === 'circular' || Math.abs(column.rotation || 0) > 1e-9) return [];
  const a = column.cx / 2;
  const b = column.cy / 2;
  const last = layers.at(-1).offset;
  const lines = (values, lo, hi) => {
    const set = [...new Set(values.map(v => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
    for (let v = set.at(-1) + sr; v <= hi + 1e-6; v += sr) set.push(v);
    for (let v = set[0] - sr; v >= lo - 1e-6; v -= sr) set.unshift(v);
    return set.filter(v => v >= lo - 1e-6 && v <= hi + 1e-6);
  };
  const all = layers.flatMap(layer => layer.points);
  const xs = lines(all.map(p => p.x), box.xMin, box.xMax);
  const ys = lines(all.map(p => p.y), box.yMin, box.yMax);
  const centre = list => list.reduce((best, v, i) => (Math.abs(v) < Math.abs(list[best]) ? i : best), 0);
  const cx = centre(xs);
  const cy = centre(ys);
  const mLast = layers.at(-1).multiple ?? 1;
  const points = [];
  // Gradual: one more step per spacing beyond the last ring, capped by the s_t limit; the outermost
  // lines (at the drop edge) are always kept so the edge zone has links.
  const edgeX = [xs[0], xs.at(-1)];
  const edgeY = [ys[0], ys.at(-1)];
  xs.forEach((x, ix) => ys.forEach((y, iy) => {
    if (!(Math.abs(x) > a + last + 1e-6 || Math.abs(y) > b + last + 1e-6)) return;
    const reach = Math.max(Math.abs(x) - a, Math.abs(y) - b);
    const band = Math.max(1, Math.round((reach - last) / sr));
    const cap = Math.max(1, Math.floor(((reach <= 2 * d ? 1.5 : 2) * d) / sr + 1e-9));
    const m = widen ? Math.max(1, Math.min(cap, mLast + band)) : 1;
    const onEdgeX = edgeX.some(v => Math.abs(v - x) < 1e-6);
    const onEdgeY = edgeY.some(v => Math.abs(v - y) < 1e-6);
    const alongX = (ix - cx) % m === 0;
    const alongY = (iy - cy) % m === 0;
    if ((alongX || onEdgeX) && (alongY || onEdgeY)) points.push({ x, y });
  }));
  return points;
}

// Radial arrangement inside a drop: every radial line of the last perimeter continues outward at s_r to
// the drop edge (less cover), with one more link on the edge when the gap left exceeds s_r/4, so the outer
// zone of the drop is reinforced up to the depth change. Face lines run perpendicular to their face, corner
// lines away from the column corner. Detailing links, as for the grid: not part of any perimeter.
export function radialDropFillPoints({ column, layers, sr, box }) {
  if (!box || !layers.length || !(sr > 0) || Math.abs(column.rotation || 0) > 1e-9) return [];
  const circular = column.shape === 'circular';
  const a = circular ? 0 : column.cx / 2;
  const b = circular ? 0 : column.cy / 2;
  const inBox = p => p.x >= box.xMin - 1e-6 && p.x <= box.xMax + 1e-6 && p.y >= box.yMin - 1e-6 && p.y <= box.yMax + 1e-6;
  const direction = p => {
    if (circular) return { x: p.x, y: p.y };
    if (Math.abs(p.y) <= b + 1e-6) return { x: Math.sign(p.x), y: 0 };
    if (Math.abs(p.x) <= a + 1e-6) return { x: 0, y: Math.sign(p.y) };
    return { x: p.x - Math.sign(p.x) * a, y: p.y - Math.sign(p.y) * b };
  };
  // Distance along the unit direction from p to the box boundary.
  const reach = (p, u) => Math.min(
    u.x > 1e-12 ? (box.xMax - p.x) / u.x : u.x < -1e-12 ? (box.xMin - p.x) / u.x : Infinity,
    u.y > 1e-12 ? (box.yMax - p.y) / u.y : u.y < -1e-12 ? (box.yMin - p.y) / u.y : Infinity,
  );
  const points = [];
  for (const p of layers.at(-1).points) {
    if (!inBox(p)) continue;
    const raw = direction(p);
    const len = Math.hypot(raw.x, raw.y);
    if (!(len > 0)) continue;
    const u = { x: raw.x / len, y: raw.y / len };
    const room = reach(p, u);
    if (!(room > 0) || !Number.isFinite(room)) continue;
    let k = 1;
    for (; k * sr <= room + 1e-6; k += 1) points.push({ x: p.x + u.x * k * sr, y: p.y + u.y * k * sr });
    const left = room - (k - 1) * sr;
    if (left > sr / 4) points.push({ x: p.x + u.x * room, y: p.y + u.y * room });
  }
  return points;
}
