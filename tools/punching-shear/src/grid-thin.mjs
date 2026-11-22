// Orthogonal grid: wider tangential spacing on the outer rings, in whole multiples of the inner grid
// spacing (s_t, 2s_t, 3s_t …) so every kept link stays on the inner grid lines. Ring by ring from the
// column outward, the largest multiple m (never smaller than on the ring inside it) is kept for which
//   - the largest gap along the control path at the ring is ≤ 1.5d inside u1 and ≤ 2d outside (§9.4.3(1)),
//     so u_out,ef keeps its full length (no gap > 2d, Fig. 6.22 A);
//   - the ring still carries the A_sw of Eq. 6.52;
//   - one leg still meets Eq. 9.11 with that gap as s_t.
// Every ring, the first included, takes the widest multiple the limits allow; ring corners are always kept. Applied where Fig. 6.22 applies (internal column, no openings or drop).
const near = (a, b) => Math.abs(a - b) < 1e-6;

function thinRing(layer, column, m) {
  if (m <= 1) return layer.points;
  const a = column.shape === 'circular' ? column.diameter / 2 : column.cx / 2;
  const b = column.shape === 'circular' ? column.diameter / 2 : column.cy / 2;
  const ex = a + layer.offset;
  const ey = b + layer.offset;
  // Positions along each side, indexed from the middle of the side outward.
  const along = values => {
    const sorted = [...new Set(values.map(v => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
    const mid = sorted.reduce((best, v, i) => (Math.abs(v) < Math.abs(sorted[best]) ? i : best), 0);
    return v => (sorted.findIndex(w => near(w, v)) - mid) % m === 0;
  };
  const onX = layer.points.filter(p => near(Math.abs(p.y), ey)).map(p => p.x);
  const onY = layer.points.filter(p => near(Math.abs(p.x), ex)).map(p => p.y);
  const keepX = along(onX);
  const keepY = along(onY);
  return layer.points.filter(p => {
    const corner = near(Math.abs(p.x), ex) && near(Math.abs(p.y), ey);
    if (corner) return true;
    return near(Math.abs(p.y), ey) ? keepX(p.x) : keepY(p.y);
  });
}

export function thinGrid(layers, { column, d, sr, aswReq, legArea, leg, minLeg, gap, maxMultiple = 6 }) {
  let m = 1;
  return layers.map(layer => {
    const limit = (layer.offset <= 2 * d ? 1.5 : 2) * d;
    let best = layer.points;
    for (let k = m; k <= maxMultiple; k += 1) {
      const points = thinRing(layer, column, k);
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
