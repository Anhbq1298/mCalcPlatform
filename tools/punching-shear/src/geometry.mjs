// Control perimeter and layer path geometry for internal columns (EN 1992-1-1:2004 §6.4.2).
// Local axes follow the column: x along c_x, y along c_y. Global = rotate(θ) + translate(centre).
// Rectangular paths are offset rectangles with rounded corners of radius r (minimum length);
// circular paths are concentric circles. Lengths are exact (no polygon approximation).

export const CONTROL_OFFSET_FACTOR = 2; // basic control perimeter at 2d from the loaded area

export function loadedPerimeter(column) {
  return column.shape === 'circular' ? Math.PI * column.diameter : 2 * (column.cx + column.cy);
}

export function perimeterAtOffset(column, r) {
  if (column.shape === 'circular') return Math.PI * (column.diameter + 2 * r);
  return 2 * (column.cx + column.cy) + 2 * Math.PI * r;
}

export function basicPerimeter(column, d) {
  return perimeterAtOffset(column, CONTROL_OFFSET_FACTOR * d);
}

export function offsetOfPerimeter(column, u) {
  if (column.shape === 'circular') return (u / Math.PI - column.diameter) / 2;
  return (u - 2 * (column.cx + column.cy)) / (2 * Math.PI);
}

// W1 = ∫|e| dl about the centroidal axis normal to the eccentricity; c1 is parallel to e (Eq. 6.41).
export function sectionModulusRect(c1, c2, d) {
  const r = CONTROL_OFFSET_FACTOR * d;
  return (c1 * c1) / 2 + c1 * c2 + 2 * r * c2 + Math.PI * r * c1 + 4 * r * r;
}

export function sectionModulusCircular(diameter, d) {
  const span = diameter + 4 * d;
  return span * span;
}

// Straight and arc pieces of the path at offset r, starting at the middle of the +x side, anticlockwise.
function pieces(column, r) {
  if (column.shape === 'circular') {
    const R = column.diameter / 2 + r;
    return [{ kind: 'arc', cx: 0, cy: 0, R, from: 0, to: 2 * Math.PI, length: 2 * Math.PI * R }];
  }
  const a = column.cx / 2;
  const b = column.cy / 2;
  const line = (x0, y0, x1, y1) => ({ kind: 'line', x0, y0, x1, y1, length: Math.hypot(x1 - x0, y1 - y0) });
  const arc = (cx, cy, from) => ({ kind: 'arc', cx, cy, R: r, from, to: from + Math.PI / 2, length: (Math.PI / 2) * r });
  return [
    line(a + r, 0, a + r, b), arc(a, b, 0), line(a, b + r, -a, b + r), arc(-a, b, Math.PI / 2),
    line(-a - r, b, -a - r, -b), arc(-a, -b, Math.PI), line(-a, -b - r, a, -b - r), arc(a, -b, 1.5 * Math.PI),
    line(a + r, -b, a + r, 0),
  ].filter(piece => piece.length > 0);
}

export const pathPieces = (column, r) => pieces(column, r);

// Local point and unit tangent at arc length s along the path at offset r.
export function pointAt(column, r, s) {
  const list = pieces(column, r);
  const total = list.reduce((sum, piece) => sum + piece.length, 0);
  let rest = ((s % total) + total) % total;
  for (const piece of list) {
    if (rest <= piece.length || piece === list[list.length - 1]) {
      const t = piece.length ? Math.min(rest / piece.length, 1) : 0;
      if (piece.kind === 'line') {
        const tx = (piece.x1 - piece.x0) / piece.length;
        const ty = (piece.y1 - piece.y0) / piece.length;
        return { x: piece.x0 + (piece.x1 - piece.x0) * t, y: piece.y0 + (piece.y1 - piece.y0) * t, tx, ty };
      }
      const angle = piece.from + (piece.to - piece.from) * t;
      return { x: piece.cx + piece.R * Math.cos(angle), y: piece.cy + piece.R * Math.sin(angle), tx: -Math.sin(angle), ty: Math.cos(angle) };
    }
    rest -= piece.length;
  }
  throw new Error('Path evaluation failed.');
}

export function toGlobal(column, point) {
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: (column.x || 0) + point.x * c - point.y * s, y: (column.y || 0) + point.x * s + point.y * c };
}

export function toLocal(column, point) {
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const dx = point.x - (column.x || 0);
  const dy = point.y - (column.y || 0);
  return { x: dx * Math.cos(theta) + dy * Math.sin(theta), y: -dx * Math.sin(theta) + dy * Math.cos(theta) };
}

// Global polyline of the path at offset r. Straight pieces use their end points; arcs are sampled
// at ≤ 2° per step for drawing only (lengths are always taken from the exact expressions above).
export function pathPolyline(column, r) {
  const points = [];
  for (const piece of pieces(column, r)) {
    if (piece.kind === 'line') points.push({ x: piece.x0, y: piece.y0 }, { x: piece.x1, y: piece.y1 });
    else {
      const steps = Math.max(2, Math.ceil(((piece.to - piece.from) * 180) / Math.PI / 2));
      for (let i = 0; i <= steps; i += 1) {
        const angle = piece.from + ((piece.to - piece.from) * i) / steps;
        points.push({ x: piece.cx + piece.R * Math.cos(angle), y: piece.cy + piece.R * Math.sin(angle) });
      }
    }
  }
  return points.map(point => toGlobal(column, point));
}

// Largest distance from the column centre to the path at offset r, in each global direction,
// used to test the path against slab edges (axis-aligned slab) without discretisation error.
export function pathExtent(column, r) {
  if (column.shape === 'circular') {
    const R = column.diameter / 2 + r;
    return { xMin: (column.x || 0) - R, xMax: (column.x || 0) + R, yMin: (column.y || 0) - R, yMax: (column.y || 0) + R };
  }
  const theta = ((column.rotation || 0) * Math.PI) / 180;
  const a = column.cx / 2;
  const b = column.cy / 2;
  const hx = a * Math.abs(Math.cos(theta)) + b * Math.abs(Math.sin(theta)) + r;
  const hy = a * Math.abs(Math.sin(theta)) + b * Math.abs(Math.cos(theta)) + r;
  return { xMin: (column.x || 0) - hx, xMax: (column.x || 0) + hx, yMin: (column.y || 0) - hy, yMax: (column.y || 0) + hy };
}

// Shortest distance from a global point to the loaded area (0 inside).
export function distanceToColumn(column, point) {
  const p = toLocal(column, point);
  if (column.shape === 'circular') return Math.max(0, Math.hypot(p.x, p.y) - column.diameter / 2);
  const dx = Math.max(Math.abs(p.x) - column.cx / 2, 0);
  const dy = Math.max(Math.abs(p.y) - column.cy / 2, 0);
  return Math.hypot(dx, dy);
}

// Shortest distance from an axis-aligned opening rectangle to the loaded area. The distance to a
// convex set is convex along a straight edge, so a ternary search per edge finds the exact minimum.
export function openingDistance(column, opening) {
  const x0 = opening.x - opening.w / 2;
  const y0 = opening.y - opening.h / 2;
  const corners = [[x0, y0], [x0 + opening.w, y0], [x0 + opening.w, y0 + opening.h], [x0, y0 + opening.h]];
  if (pointInOpening(opening, { x: column.x || 0, y: column.y || 0 })) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const at = t => distanceToColumn(column, { x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 100; k += 1) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (at(m1) <= at(m2)) hi = m2; else lo = m1;
    }
    best = Math.min(best, at(0), at(1), at((lo + hi) / 2));
  }
  return best;
}

export function pointInOpening(opening, point) {
  return Math.abs(point.x - opening.x) <= opening.w / 2 && Math.abs(point.y - opening.y) <= opening.h / 2;
}

export function pointInSlab(slab, point) {
  return point.x >= slab.xMin && point.x <= slab.xMax && point.y >= slab.yMin && point.y <= slab.yMax;
}
