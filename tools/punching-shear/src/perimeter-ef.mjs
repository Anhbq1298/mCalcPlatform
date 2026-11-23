// Fig. 6.22 effective outer perimeter and the face-gap filter (used by the auto arrangements).
import { pathPieces } from './geometry.mjs';

// Effective outer perimeter of Fig. 6.22 (internal column, no openings): the path 1.5d outside the
// polygon through the outermost links. Where two adjacent outer links are more than 2d apart only d
// beyond each of them counts (Fig. 6.22 B), so u_out,ef = Σ min(L_i, 2d) + 2π·1.5d, with L_i the
// distances between adjacent outer links around the column (interpretation of the figure).
export function outerPerimeterEf(points, d, outerK = 1.5) {
  if (points.length < 3) return { u: 0, full: 0, segments: [] };
  const ring = [...points].sort((p, q) => Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x));
  const segments = ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    return { from: p, to: q, length, counted: Math.min(length, 2 * d) };
  });
  const arcs = 2 * Math.PI * outerK * d;
  return {
    u: segments.reduce((sum, seg) => sum + seg.counted, 0) + arcs,
    full: segments.reduce((sum, seg) => sum + seg.length, 0) + arcs,
    segments,
  };
}

// Cruciform layers: keep only the gaps between lines on the same column face (both ends on one straight
// piece of the path); the gaps around the column corners are covered by u_out,ef (Fig. 6.22 B).
export function faceGaps(column, offset, tangential) {
  const lines = [];
  let start = 0;
  for (const piece of pathPieces(column, offset)) {
    if (piece.kind === 'line') lines.push([start, start + piece.length]);
    start += piece.length;
  }
  const total = start;
  // The path starts and ends on the same face (mid +x face): a gap across s = 0 lies on that face.
  const first = lines[0];
  const last = lines.at(-1);
  const on = (s0, s1) => (s1 <= total + 1e-6
    ? lines.some(([a, b]) => s0 >= a - 1e-6 && s1 <= b + 1e-6)
    : first[0] < 1e-6 && last[1] > total - 1e-6 && s0 >= last[0] - 1e-6 && s1 - total <= first[1] + 1e-6);
  const gaps = tangential.gaps.filter(gap => on(gap.s0, gap.s1));
  return { max: gaps.length ? Math.max(...gaps.map(gap => gap.length)) : 0, gaps };
}
